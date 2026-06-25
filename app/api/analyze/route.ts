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

    console.log("[DIAGNOSTIC] /api/analyze: Gemini API request started");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contents: contents as any,
      config: {
        responseMimeType: "application/json",
      },
    });

    console.log("[DIAGNOSTIC] /api/analyze: Gemini response received");
    const responseText = response.text;
    if (!responseText) {
      throw new Error("No response received from Gemini API");
    }

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
    let parsedData = null;
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

    if (!parsedData) {
      // Graceful fallback structure
      parsedData = {
        issue_type: "Civic Issue",
        category: "Other",
        severity: "Medium",
        confidence: 50,
        description: description || "Reported civic issue requiring inspection.",
        recommended_department: "General Administration",
        estimated_resolution: "3-5 business days"
      };
    }

    return NextResponse.json({ success: true, analysis: parsedData });
  } catch (error: unknown) {
    console.error("[DIAGNOSTIC] /api/analyze: Detailed Error Stack:");
    if (error instanceof Error) {
      console.error(error.stack);
    } else {
      console.error(error);
    }
    const errMsg = error instanceof Error ? error.message : "Failed to analyze civic issue";
    return NextResponse.json({
      success: false,
      code: "INTERNAL_ERROR",
      message: errMsg
    }, { status: 500 });
  }
}
