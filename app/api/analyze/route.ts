import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

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
    console.log("[DIAGNOSTIC] /api/analyze: Request received");
    const body = await req.json();
    const { image, description } = body;

    console.log(`[DIAGNOSTIC] /api/analyze: imageBase64 exists = ${!!image}`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[DIAGNOSTIC] /api/analyze: GEMINI_API_KEY missing");
      return NextResponse.json({
        success: false,
        code: "API_KEY_UNCONFIGURED",
        message: "GEMINI_API_KEY environment variable is not configured on the server."
      }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Prepare contents array for Gemini
    const contents: GeminiContentPart[] = [];

    if (image) {
      // The image is expected to be a base64 string (e.g. "data:image/jpeg;base64,...")
      // Extract the base64 part and mime type if format is "data:<mime>;base64,<data>"
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
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
        // Fallback if it's just raw base64 string
        contents.push({
          inlineData: {
            data: image,
            mimeType: "image/jpeg",
          },
        });
      }
    }

    // Add user description text
    const textPrompt = `
Analyze the following civic issue reported by a citizen. If an image is provided, analyze the image to identify the issue.
User Description: "${description || "No description provided."}"

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

    console.log(`[DIAGNOSTIC] /api/analyze: Gemini response received, modelUsed = ${modelUsed}`);
    let parsedData = null;

    if (modelUsed !== "manual-fallback" && responseText) {
      // Clean up code fences or markdown blocks if present
      let cleanText = responseText.trim();
      if (cleanText.startsWith("```")) {
        // Remove starting fence
        cleanText = cleanText.replace(/^```(?:json)?\n?/i, "");
        // Remove ending fence
        cleanText = cleanText.replace(/\n?```$/i, "");
      }
      cleanText = cleanText.trim();

      console.log("[DIAGNOSTIC] /api/analyze: Parsing JSON response");
      try {
        parsedData = JSON.parse(cleanText);
        console.log("[DIAGNOSTIC] /api/analyze: JSON parsed successfully");
      } catch (e) {
        console.warn("JSON.parse failed. Retrying with regex cleanup.", e);
        // Try to find any JSON-like substring
        const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsedData = JSON.parse(jsonMatch[0]);
            console.log("[DIAGNOSTIC] /api/analyze: JSON parsed via fallback regex");
          } catch (e2) {
            console.error("Fallback parsing failed", e2);
          }
        }
      }
    }

    if (!parsedData || modelUsed === "manual-fallback") {
      // Graceful fallback structure
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

    return NextResponse.json({
      success: true,
      analysis: parsedData,
      analysisSource: modelUsed,
      message: friendlyError
    });
  } catch (outerError: unknown) {
    console.error("[DIAGNOSTIC] /api/analyze: Detailed Error Stack:");
    if (outerError instanceof Error) {
      console.error(outerError.stack);
    } else {
      console.error(outerError);
    }
    const friendlyMsg = getFriendlyErrorMessage(outerError);
    return NextResponse.json({
      success: false,
      code: "INTERNAL_ERROR",
      message: friendlyMsg
    }, { status: 500 });
  }
}
