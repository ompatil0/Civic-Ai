import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { db } from "@/lib/firestore";
import { doc, getDoc, updateDoc, serverTimestamp, collection } from "firebase/firestore";
import { calculatePriorityScore } from "@/utils/priority";
import { createAuditLog } from "@/lib/audit";

interface TextPart {
  text: string;
}

interface InlineDataPart {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

type GeminiContentPart = string | TextPart | InlineDataPart;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getFriendlyErrorMessage(error: any): string {
  const msg = (error?.message || String(error)).toLowerCase();
  const status = error?.status || error?.statusCode;
  
  if (status === 429 || msg.includes("resource_exhausted") || msg.includes("quota") || msg.includes("limit") || msg.includes("rate")) {
    return "AI quota exceeded. Your report has been submitted successfully and will be reviewed manually.";
  }
  if (msg.includes("fetch") || msg.includes("connect") || msg.includes("network") || msg.includes("timeout") || msg.includes("eai_again") || msg.includes("socket")) {
    return "Unable to connect to the AI service. Your report has been submitted for manual review.";
  }
  return "AI analysis is temporarily unavailable. Your report has been submitted successfully.";
}

export async function POST(req: NextRequest) {
  try {
    console.log("[DIAGNOSTIC] /api/process-issue: Request received");
    const body = await req.json();
    const { issueId } = body;

    if (!issueId) {
      console.error("[DIAGNOSTIC] /api/process-issue: Missing issueId");
      return NextResponse.json({
        success: false,
        code: "MISSING_ISSUE_ID",
        message: "Missing issueId in request body."
      }, { status: 400 });
    }

    // 1. Fetch issue from Firestore
    console.log(`[DIAGNOSTIC] /api/process-issue: Loading Firestore doc for issueId = ${issueId}`);
    const issueRef = doc(db, "issues", issueId);
    const issueSnap = await getDoc(issueRef);

    if (!issueSnap.exists()) {
      console.error(`[DIAGNOSTIC] /api/process-issue: Doc not found for id = ${issueId}`);
      return NextResponse.json({
        success: false,
        code: "ISSUE_NOT_FOUND",
        message: "Issue not found in Firestore."
      }, { status: 404 });
    }

    console.log("[DIAGNOSTIC] /api/process-issue: Firestore document loaded");
    const docData = issueSnap.data();
    const imageBase64 = docData.imageBase64;
    const issueDescription = docData.description;
    const trafficRisk = docData.trafficRisk === true;
    const nearbySchool = docData.nearbySchool === true;
    const nearbyHospital = docData.nearbyHospital === true;
    const locationRisk = docData.locationRisk === true;

    console.log(`[DIAGNOSTIC] /api/process-issue: imageBase64 exists = ${!!imageBase64}`);

    // 2. Call Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[DIAGNOSTIC] /api/process-issue: GEMINI_API_KEY missing");
      return NextResponse.json({
        success: false,
        code: "API_KEY_UNCONFIGURED",
        message: "GEMINI_API_KEY environment variable is not configured on the server."
      }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const contents: GeminiContentPart[] = [];

    // Parse the base64 image data directly for Gemini
    if (imageBase64) {
      try {
        const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const mimeType = match[1];
          const base64Data = match[2];
          contents.push({
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          });
        } else {
          contents.push({
            inlineData: {
              data: imageBase64,
              mimeType: "image/jpeg",
            },
          });
        }
      } catch (err) {
        console.error("Failed to parse imageBase65 for Gemini analysis:", err);
      }
    }

    const textPrompt = `
Analyze the following civic issue reported by a citizen. If an image is provided, analyze the image to identify the issue.
User Description: "${issueDescription || "No description provided."}"

Provide the output in JSON format with the following keys:
- issue_type: A short specific label for the issue (e.g., Pothole, Pavement crack, Blown bulb)
- category: A general category (must be one of: "Pothole", "Broken Streetlight", "Graffiti", "Illegal Dumping", "Water Leak", "Traffic Hazard", "Other")
- severity: One of ["Low", "Medium", "High", "Critical"]
- confidence: A percentage value (number between 0 and 100) indicating confidence in the analysis
- description: A clean description or summary of what was found
- recommended_department: The city/municipal department that should handle this (e.g. "Department of Public Works", "Water Management", "Traffic Safety Department")
- estimated_resolution: A realistic estimate of resolution time (e.g. "24-48 hours", "3-5 business days")

Return ONLY the raw JSON output. Do not wrap in markdown blocks.
`;
    contents.push(textPrompt);

    let modelUsed = "gemini-2.5-flash";
    let responseText = "";
    let friendlyError: string | null = null;

    try {
      console.log("AI Model:\ngemini-2.5-flash");
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contents: contents as any,
        config: {
          responseMimeType: "application/json",
        },
      });
      responseText = response.text || "";
      if (!responseText) {
        throw new Error("Empty response text from primary model");
      }
    } catch (primaryError: unknown) {
      console.log("Primary model failed.\nSwitching to gemini-2.0-flash...");
      modelUsed = "gemini-2.0-flash";
      friendlyError = getFriendlyErrorMessage(primaryError);

      try {
        console.log("AI Model:\ngemini-2.0-flash");
        const response = await ai.models.generateContent({
          model: "gemini-2.0-flash",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          contents: contents as any,
          config: {
            responseMimeType: "application/json",
          },
        });
        responseText = response.text || "";
        if (!responseText) {
          throw new Error("Empty response text from fallback model");
        }
      } catch (secondaryError: unknown) {
        console.log("Both AI models failed.\nUsing manual fallback.");
        modelUsed = "manual-fallback";
        friendlyError = getFriendlyErrorMessage(secondaryError);
      }
    }

    console.log(`[DIAGNOSTIC] /api/process-issue: Gemini response received, modelUsed = ${modelUsed}`);
    let parsedData = null;

    if (modelUsed !== "manual-fallback" && responseText) {
      // Clean up code fences or markdown blocks if present
      let cleanText = responseText.trim();
      if (cleanText.startsWith("```")) {
        cleanText = cleanText.replace(/^```(?:json)?\n?/i, "");
        cleanText = cleanText.replace(/\n?```$/i, "");
      }
      cleanText = cleanText.trim();

      console.log("[DIAGNOSTIC] /api/process-issue: Parsing JSON response");
      try {
        parsedData = JSON.parse(cleanText);
        console.log("[DIAGNOSTIC] /api/process-issue: JSON parsed successfully");
      } catch (e) {
        console.warn("JSON.parse failed. Retrying with regex cleanup.", e);
        const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsedData = JSON.parse(jsonMatch[0]);
            console.log("[DIAGNOSTIC] /api/process-issue: JSON parsed via fallback regex");
          } catch (e2) {
            console.error("Fallback parsing failed", e2);
          }
        }
      }
    }

    if (!parsedData || modelUsed === "manual-fallback") {
      parsedData = {
        issue_type: "Unknown",
        category: "Other",
        severity: "Medium",
        confidence: 0,
        description: "AI analysis unavailable. Manual review required.",
        recommended_department: "General Administration",
        estimated_resolution: "Pending Review"
      };
    }

    // 3. Calculate priority score
    const priorityScore = calculatePriorityScore({
      severity: parsedData.severity || "Medium",
      trafficRisk,
      nearbySchool,
      nearbyHospital,
      locationRisk
    });

    const statusValue = modelUsed === "manual-fallback" ? "pending_ai" : "open";

    // 4. Update Firestore with final analysis and status
    console.log(`[DIAGNOSTIC] /api/process-issue: Updating Firestore document for id = ${issueId}, status = ${statusValue}`);
    await updateDoc(issueRef, {
      issueType: parsedData.issue_type,
      category: parsedData.category,
      severity: parsedData.severity,
      confidence: parsedData.confidence,
      description: parsedData.description,
      recommendedDepartment: parsedData.recommended_department,
      estimatedResolution: parsedData.estimated_resolution,
      priorityScore,
      analyzedAt: serverTimestamp(),
      status: statusValue,
      analysisSource: modelUsed
    });
    console.log("[DIAGNOSTIC] /api/process-issue: Firestore document updated successfully");

    // Audit Log for AI Analysis
    await createAuditLog({
      issueId: issueId,
      action: "AI Analysis Completed",
      performedByUid: modelUsed === "manual-fallback" ? "manual-fallback" : "gemini-ai",
      performedByName: modelUsed === "manual-fallback" ? "Manual Fallback Review" : "Gemini AI Scan",
      performedByEmail: modelUsed === "manual-fallback" ? "system@civic.ai" : "gemini-ai@civic.ai",
      performedByRole: "system",
      before: {
        status: "processing"
      },
      after: {
        issueType: parsedData.issue_type,
        category: parsedData.category,
        severity: parsedData.severity,
        confidence: parsedData.confidence,
        recommendedDepartment: parsedData.recommended_department,
        estimatedResolution: parsedData.estimated_resolution,
        priorityScore,
        status: statusValue
      },
      metadata: { 
        confidence: parsedData.confidence,
        analysisSource: modelUsed,
        error: friendlyError || undefined
      }
    }).catch(console.error);

    return NextResponse.json({
      success: true,
      priorityScore,
      analysisSource: modelUsed,
      message: friendlyError
    });
  } catch (error: unknown) {
    console.error("[DIAGNOSTIC] /api/process-issue: Detailed Error Stack:");
    if (error instanceof Error) {
      console.error(error.stack);
    } else {
      console.error(error);
    }
    const friendlyMsg = getFriendlyErrorMessage(error);
    return NextResponse.json({
      success: false,
      code: "INTERNAL_ERROR",
      message: friendlyMsg
    }, { status: 500 });
  }
}
