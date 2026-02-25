import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

// What we know from the CRM
const contactContext = {
  name: "Chris Birchby",
  location: "West Lake Hills, TX (Austin area)",
  company: "COOLA skincare (CEO)",
  tags: ["Yuri Yuan"],
  invoiceCount: 4,
  totalSpend: "$115,150",
  galleryName: "Make Room Los Angeles",
  galleryArtists: [
    "Jacopo Pagin", "Fawn Rogers", "Ilona Szwarc", "Guimi You",
    "Yuri Yuan", "Catalina Ouyang", "Yoab Vera", "Xin Liu",
    "Shana Hoehn", "Linn Meyers", "Miguel Angel Payano Jr.",
  ],
};

async function testEnrichment() {
  console.log("Researching:", contactContext.name);
  console.log("---");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    messages: [
      {
        role: "user",
        content: `You are a research assistant for an art gallery called "${contactContext.galleryName}".
Your task is to research a collector/contact and compile a brief profile using ONLY publicly available information.

## Contact Information (from our CRM)
- **Name:** ${contactContext.name}
- **Location:** ${contactContext.location}
- **Company/Role:** ${contactContext.company}
- **Artist tags in CRM:** ${contactContext.tags.join(", ")}
- **Purchase history:** ${contactContext.invoiceCount} invoices, ~${contactContext.totalSpend} total

## Research Instructions
Search for publicly available information about this person. Focus on:
1. **Professional background** — current role, career history, notable achievements
2. **Art world involvement** — board memberships (museums, art nonprofits), advisory roles, collection mentions, art fair appearances, auction activity
3. **Philanthropic activity** — foundations, major donations, nonprofit board seats
4. **Public visibility** — press mentions, social media presence, speaking engagements
5. **Collection interests** — any public mentions of what they collect, artists they support

**Privacy rules:**
- Only use publicly available information (news articles, LinkedIn, museum websites, etc.)
- Do not speculate about private wealth, net worth, or financial details beyond what is publicly reported
- Do not include private contact information found online
- If limited information is available, say so — do not fabricate

## Output Format
Return a JSON object with these fields:

{
  "summary": "2-3 sentence overview of this person relevant to the gallery relationship",
  "professional": {
    "current_role": "Their current title and company",
    "career_highlights": ["Notable career achievements or previous roles"],
    "industry": "Their primary industry"
  },
  "art_world": {
    "board_memberships": ["Museum or art org board seats"],
    "collection_mentions": ["Any public mentions of their art collection"],
    "art_events": ["Known art fair attendance, exhibition openings, etc."],
    "advisory_roles": ["Art advisory or curatorial roles"]
  },
  "philanthropy": {
    "foundations": ["Personal or family foundations"],
    "board_seats": ["Non-art nonprofit boards"],
    "notable_giving": ["Publicly reported donations or campaigns"]
  },
  "social_presence": {
    "linkedin": "URL if found",
    "instagram": "Handle if found and relevant",
    "other": ["Other notable public profiles"]
  },
  "collection_profile": {
    "known_artists": ["Artists they are known to collect"],
    "style_preferences": ["Inferred style preferences based on public info"],
    "engagement_level": "active_collector | casual_buyer | institutional | unknown"
  },
  "sources": [
    { "url": "https://...", "title": "Source title", "relevance": "What this source tells us" }
  ],
  "confidence": "high | medium | low",
  "notes": "Any caveats about the research quality or information gaps"
}

Return ONLY valid JSON, no other text.`,
      },
    ],
  });

  // Extract the final text response (after any tool use)
  const textBlocks = response.content.filter(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  const text = textBlocks[textBlocks.length - 1]?.text || "{}";

  // Try to parse JSON (might have markdown code fences)
  const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const result = JSON.parse(jsonStr);
    console.log(JSON.stringify(result, null, 2));
  } catch {
    console.log("Raw response (could not parse JSON):");
    console.log(text);
  }

  // Also show usage
  console.log("\n--- Usage ---");
  console.log("Input tokens:", response.usage.input_tokens);
  console.log("Output tokens:", response.usage.output_tokens);
}

testEnrichment().catch(console.error);
