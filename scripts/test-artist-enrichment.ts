import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "../src/lib/supabase/admin";

const anthropic = new Anthropic();

const GALLERY_NAME = "Make Room Los Angeles";

const STYLE_TAGS = [
  "abstract", "figurative", "expressionist", "surrealist", "painterly",
  "conceptual", "minimalist", "mixed-media", "photorealistic", "sculptural",
  "geometric", "assemblage", "organic", "atmospheric", "hyperrealist",
  "documentary", "impressionist", "narrative", "decorative", "lyrical abstraction",
  "realist", "textural", "pop art", "monochromatic", "gestural",
  "process-based", "collage", "installation", "digital", "folk art",
];

const SUBJECT_TAGS = [
  "figure", "nature", "still life", "portrait", "landscape",
  "interior", "body", "architectural", "floral", "botanical",
  "urban", "sculpture", "organic forms", "seascape", "symbolic",
  "pattern", "identity", "animal", "mythology", "domestic",
  "abstract form", "fashion", "nude", "celestial", "political",
  "narrative", "industrial", "food", "religious", "textile",
];

const MOOD_TAGS = [
  "contemplative", "mysterious", "intimate", "dramatic", "somber",
  "serene", "vibrant", "energetic", "unsettling", "melancholic",
  "dreamlike", "playful", "uncanny", "ethereal", "nostalgic",
  "meditative", "visceral", "vulnerable", "whimsical", "provocative",
  "intense", "hypnotic", "introspective", "otherworldly", "confrontational",
];

async function testArtistEnrichment() {
  const admin = createAdminClient();
  const artistId = "UiFLOJL4"; // Jacopo Pagin

  // Fetch artist
  const { data: artist } = await admin
    .from("artists")
    .select("*")
    .eq("id", artistId)
    .single();

  if (!artist) {
    console.error("Artist not found");
    process.exit(1);
  }

  console.log(`Researching: ${artist.display_name}`);
  console.log(`Country: ${artist.country || "Unknown"}, Life dates: ${artist.life_dates || "Unknown"}`);
  console.log(`Works: ${artist.work_count}, Bio: ${artist.bio ? artist.bio.slice(0, 80) + "..." : "None"}`);

  // Get price range
  const { data: priceData } = await admin.rpc("get_artist_price_range", { p_artist_id: artistId }).single();
  // Fallback: direct query
  const { data: artworks } = await admin
    .from("artworks")
    .select("title, medium, year, price")
    .contains("artist_ids", [artistId])
    .not("price", "is", null)
    .order("price", { ascending: false })
    .limit(10);

  const prices = (artworks ?? []).map((a) => a.price).filter(Boolean) as number[];
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;

  console.log(`Price range: $${minPrice?.toLocaleString()} - $${maxPrice?.toLocaleString()}`);

  // Get aggregate vision tags from their artworks
  const { data: visionData } = await admin
    .from("artworks_extended")
    .select("style_tags, subject_tags, mood_tags, artwork_id")
    .in(
      "artwork_id",
      (artworks ?? []).map((a: any) => a.id).filter(Boolean),
    );

  // Actually, let's get artwork IDs first
  const { data: allArtworkIds } = await admin
    .from("artworks")
    .select("id")
    .contains("artist_ids", [artistId]);

  const ids = (allArtworkIds ?? []).map((a) => a.id);

  const { data: visionRows } = await admin
    .from("artworks_extended")
    .select("style_tags, subject_tags, mood_tags")
    .in("artwork_id", ids)
    .not("vision_analyzed_at", "is", null)
    .limit(100);

  // Aggregate most common tags
  function topTags(rows: any[], field: string, limit = 8): string[] {
    const counts = new Map<string, number>();
    for (const row of rows ?? []) {
      for (const tag of row[field] ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag]) => tag);
  }

  const existingStyleTags = topTags(visionRows ?? [], "style_tags");
  const existingSubjectTags = topTags(visionRows ?? [], "subject_tags");
  const existingMoodTags = topTags(visionRows ?? [], "mood_tags");

  console.log(`Vision analysis available for ${(visionRows ?? []).length} works`);
  console.log(`Top style tags: ${existingStyleTags.join(", ")}`);
  console.log(`Top subject tags: ${existingSubjectTags.join(", ")}`);
  console.log(`Top mood tags: ${existingMoodTags.join(", ")}`);

  // Sample artworks for context
  const sampleWorks = (artworks ?? []).slice(0, 8).map(
    (a) => `"${a.title}" (${a.year}) — ${a.medium}, $${a.price?.toLocaleString()}`
  ).join("\n  ");

  // Get gallery artists for context
  const { data: galleryArtists } = await admin
    .from("artists")
    .select("display_name")
    .order("work_count", { ascending: false })
    .limit(30);

  const otherArtists = (galleryArtists ?? [])
    .map((a) => a.display_name)
    .filter((n) => n && n !== artist.display_name);

  // Build prompt
  const prompt = `You are a research assistant for an art gallery called "${GALLERY_NAME}".
Your task is to research an artist represented by the gallery and compile a comprehensive profile using publicly available information. This research will be used by gallery staff to understand the artist's practice and connect their work with collectors.

## Artist Information (from our records)
- **Name:** ${artist.display_name}
- **Country:** ${artist.country || "Unknown"}
- **Life Dates:** ${artist.life_dates || "Unknown"}
- **Bio (from CRM):** ${artist.bio || "No bio on file"}
- **Works in inventory:** ${artist.work_count}
- **Price range:** ${minPrice && maxPrice ? `$${minPrice.toLocaleString()} – $${maxPrice.toLocaleString()}` : "Unknown"}
- **Sample works:**
  ${sampleWorks || "None available"}

## Existing artwork analysis (from AI vision analysis of their pieces)
These tags were identified by analyzing their actual artworks:
- **Style:** ${existingStyleTags.join(", ") || "Not yet analyzed"}
- **Subject:** ${existingSubjectTags.join(", ") || "Not yet analyzed"}
- **Mood:** ${existingMoodTags.join(", ") || "Not yet analyzed"}

## Gallery Context
${GALLERY_NAME} also represents: ${otherArtists.join(", ")}

## Research Instructions
Search for publicly available information about this artist. **Prioritize understanding the artist as a thinker and maker**, not just listing CV facts.

Focus on, in order of importance:
1. **Artistic practice & philosophy** — What drives the work? What are the artist's stated intentions, conceptual framework, and creative vision? Look for artist statements, interviews, studio visits, and critical essays.
2. **Process & materials** — How do they work? What techniques, materials, and methods define their studio practice?
3. **Themes & development** — What recurring themes, questions, or concerns run through the body of work? How has the work evolved over time — identify key phases or shifts in the practice.
4. **Influences** — What artists, movements, thinkers, or traditions inform their work?
5. **Exhibition history** — Notable solo and group exhibitions, especially recent ones
6. **Career milestones** — Education, awards, grants, residencies
7. **Market & collections** — Gallery representation, museum collections, auction results if any
8. **Public presence** — Website, Instagram, press mentions

**Privacy rules:**
- Only use publicly available information
- Do not speculate about financial details beyond what is publicly reported
- If limited information is available, say so — do not fabricate

## Output Format
Return a JSON object with these fields:

{
  "summary": "2-3 sentence overview of this artist and their practice, written for gallery staff",
  "formatted_bio": "A polished, gallery-quality narrative biography (3-5 paragraphs). Written in third person. Should cover their background, education, artistic development, key themes, and current practice. Suitable for exhibition materials or the gallery website.",
  "artistic_practice": {
    "philosophy": "A paragraph describing the artist's creative vision, conceptual framework, and what drives the work. Based on their own statements and critical writing about them.",
    "process": "A paragraph about how they work — materials, techniques, studio practice, and working methods.",
    "themes": ["Recurring themes and concerns across their body of work — each as a brief phrase"],
    "evolution": "A paragraph describing how the work has developed over time — key phases, shifts, or turning points in the practice.",
    "primary_mediums": ["oil on canvas", "acrylic", etc.],
    "style_tags": ["tag1", "tag2"],
    "subject_tags": ["tag1", "tag2"],
    "mood_tags": ["tag1", "tag2"],
    "influences": ["Artists, movements, or thinkers that inform the work — Firstname Lastname or movement name"]
  },
  "career": {
    "education": ["Degree, Institution, Year"],
    "solo_exhibitions": ["Exhibition Title, Venue, Year — most notable/recent"],
    "group_exhibitions": ["Exhibition Title, Venue, Year — most notable/recent"],
    "awards_grants": ["Award or grant name, year"],
    "residencies": ["Residency name, location, year"]
  },
  "market": {
    "gallery_representation": ["Gallery Name, City"],
    "auction_results": ["Notable auction mentions if any"],
    "price_range": "General description of current market pricing",
    "market_trajectory": "rising | mid-career | established | emerging | blue-chip"
  },
  "collections": {
    "museum_collections": ["Museum or institutional collections"],
    "notable_private_collections": ["Named private collections if publicly known"]
  },
  "related_artists": ["Firstname Lastname — comparable or frequently exhibited alongside"],
  "social_presence": {
    "website": "URL if found",
    "instagram": "Handle if found",
    "other": ["Other notable profiles"]
  },
  "sources": [
    { "url": "https://...", "title": "Source title", "relevance": "What this source tells us" }
  ],
  "confidence": "high | medium | low",
  "notes": "Any caveats about the research quality or information gaps"
}

### IMPORTANT formatting rules:

**style_tags**: MUST use tags from this list ONLY: ${STYLE_TAGS.join(", ")}
  Pick 3-8 tags that best describe this artist's overall style across their body of work.

**subject_tags**: MUST use tags from this list ONLY: ${SUBJECT_TAGS.join(", ")}
  Pick 2-6 tags that describe the subject matter this artist typically works with.

**mood_tags**: MUST use tags from this list ONLY: ${MOOD_TAGS.join(", ")}
  Pick 2-5 tags that describe the mood/atmosphere typical of this artist's work.

**related_artists**: Each entry MUST be "Firstname Lastname" format only. No descriptions or notes.

**influences**: Each entry should be a name or movement. No descriptions.

Return ONLY valid JSON, no other text.`;

  console.log("\n--- Calling Claude with web search ---\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }],
    messages: [{ role: "user", content: prompt }],
  });

  // Extract final text
  const textBlocks = response.content.filter(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  const text = textBlocks[textBlocks.length - 1]?.text || "{}";

  // Extract JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.log("No JSON found in response:");
    console.log(text);
    process.exit(1);
  }

  try {
    const result = JSON.parse(jsonMatch[0]);

    // Validate tags
    const styleTags = new Set(STYLE_TAGS);
    const subjectTags = new Set(SUBJECT_TAGS);
    const moodTags = new Set(MOOD_TAGS);

    if (result.artistic_practice) {
      const before = {
        style: result.artistic_practice.style_tags?.length ?? 0,
        subject: result.artistic_practice.subject_tags?.length ?? 0,
        mood: result.artistic_practice.mood_tags?.length ?? 0,
      };

      result.artistic_practice.style_tags =
        (result.artistic_practice.style_tags ?? []).filter((t: string) => t && styleTags.has(t.toLowerCase()));
      result.artistic_practice.subject_tags =
        (result.artistic_practice.subject_tags ?? []).filter((t: string) => t && subjectTags.has(t.toLowerCase()));
      result.artistic_practice.mood_tags =
        (result.artistic_practice.mood_tags ?? []).filter((t: string) => t && moodTags.has(t.toLowerCase()));

      console.log(`Tag validation: style ${before.style}→${result.artistic_practice.style_tags.length}, subject ${before.subject}→${result.artistic_practice.subject_tags.length}, mood ${before.mood}→${result.artistic_practice.mood_tags.length}`);
    }

    console.log("\n=== RESULT ===\n");
    console.log(JSON.stringify(result, null, 2));

    // Highlight key sections
    console.log("\n=== KEY SECTIONS ===\n");
    console.log("SUMMARY:", result.summary);
    console.log("\nPHILOSOPHY:", result.artistic_practice?.philosophy);
    console.log("\nPROCESS:", result.artistic_practice?.process);
    console.log("\nTHEMES:", result.artistic_practice?.themes?.join("; "));
    console.log("\nEVOLUTION:", result.artistic_practice?.evolution);
    console.log("\nINFLUENCES:", result.artistic_practice?.influences?.join(", "));
    console.log("\nSTYLE:", result.artistic_practice?.style_tags?.join(", "));
    console.log("SUBJECT:", result.artistic_practice?.subject_tags?.join(", "));
    console.log("MOOD:", result.artistic_practice?.mood_tags?.join(", "));
    console.log("\nCONFIDENCE:", result.confidence);
    console.log("SOURCES:", result.sources?.length);
  } catch (e) {
    console.log("Failed to parse JSON:", e);
    console.log("Raw text:");
    console.log(text);
  }

  console.log("\n--- Usage ---");
  console.log("Input tokens:", response.usage.input_tokens);
  console.log("Output tokens:", response.usage.output_tokens);
}

testArtistEnrichment().catch(console.error);
