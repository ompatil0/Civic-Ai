import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { issues } = body;

    if (!issues || !Array.isArray(issues)) {
      return NextResponse.json({
        success: false,
        code: "INVALID_PAYLOAD",
        message: "Missing or invalid issues array in request body."
      }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        code: "API_KEY_UNCONFIGURED",
        message: "GEMINI_API_KEY is not configured on the server."
      }, { status: 500 });
    }

    // Format list of issues to keep the prompt clean and token-efficient
    const issuesBrief = issues.map((issue) => ({
      title: issue.title || "Untitled",
      category: issue.category || "Other",
      severity: issue.severity || "Medium",
      status: issue.status || "open",
      department: issue.department || issue.recommendedDepartment || "Unassigned",
      priorityScore: issue.priorityScore || 0,
      location: issue.location || "Unknown",
    }));

    // Aggregate key stats for the model context
    const totalCount = issuesBrief.length;
    const criticalCount = issuesBrief.filter((i) => i.severity === "Critical").length;
    const resolvedCount = issuesBrief.filter((i) => i.status === "Resolved" || i.status === "resolved").length;
    const openCount = issuesBrief.filter((i) => i.status === "open" || i.status === "open").length;

    const departmentWorkload: Record<string, number> = {};
    issuesBrief.forEach((issue) => {
      const dept = issue.department;
      departmentWorkload[dept] = (departmentWorkload[dept] || 0) + 1;
    });

    const ai = new GoogleGenAI({ apiKey });
    const textPrompt = `
You are the Smart City Control Center AI Command Director for CivicAI.
Provide an executive, professional operational summary of the city's current municipal reports based on the aggregated data and issue log below.

### AGGREGATED METRICS
- Total Registered Issues: ${totalCount}
- Open Issues: ${openCount}
- Resolved Issues: ${resolvedCount}
- Critical Priority Issues (Requires immediate dispatch): ${criticalCount}
- Department workloads: ${JSON.stringify(departmentWorkload)}

### RECENT ISSUES LOG (concise subset)
${JSON.stringify(issuesBrief.slice(0, 15), null, 2)}

### INSTRUCTIONS:
Create a beautiful, readable, and highly professional executive briefing summary. Use HTML formatting for structural sections:
- Add a bold, high-level overview of overall city infrastructure health.
- Highlight specific critical alerts or major areas of concern (especially if there are Critical severity issues).
- Provide clear, actionable recommendations for resource allocation (e.g. which departments are overloaded and require dispatch of officer resources).
- Limit the briefing to around 150-250 words. Be direct, authoritative, and helpful. Do not wrap output in markdown code fences (\`\`\`html) or raw markdown text - return it directly.
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: textPrompt,
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("No response text received from Gemini API");
    }

    return NextResponse.json({ success: true, summary: responseText.trim() });
  } catch (error: unknown) {
    console.error("Dashboard summary API error:", error);
    const errMsg = error instanceof Error ? error.message : "Failed to generate briefing";
    return NextResponse.json({
      success: false,
      code: "INTERNAL_ERROR",
      message: errMsg
    }, { status: 500 });
  }
}
