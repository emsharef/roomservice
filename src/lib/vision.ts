import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

export interface ArtworkAnalysis {
  description: string;
  style_tags: string[];
  subject_tags: string[];
  mood_tags: string[];
  color_palette: Array<{ hex: string; name: string; percentage: number }>;
}

export async function analyzeArtwork(
  imageUrl: string,
  title: string,
  artist: string,
  medium?: string | null
): Promise<ArtworkAnalysis> {
  // Fetch the image and convert to base64
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image: ${imageResponse.status}`);
  }
  const imageBuffer = await imageResponse.arrayBuffer();
  const base64 = Buffer.from(imageBuffer).toString("base64");
  const contentType = imageResponse.headers.get("content-type") || "image/jpeg";

  // Validate media type for Claude Vision
  const validMediaTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ] as const;
  type MediaType = (typeof validMediaTypes)[number];
  const mediaType: MediaType = validMediaTypes.includes(
    contentType as MediaType
  )
    ? (contentType as MediaType)
    : "image/jpeg";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64,
            },
          },
          {
            type: "text",
            text: `Analyze this artwork. Title: "${title}". Artist: ${artist}.${medium ? ` Medium: ${medium}.` : ""}

Return a JSON object with these fields:
- "description": A 2-3 sentence description of the artwork's visual content, style, and mood.
- "style_tags": Array of 3-6 style descriptors (e.g., "abstract", "figurative", "minimalist", "expressionist", "geometric", "photorealistic", "impressionist", "surrealist", "contemporary", "traditional").
- "subject_tags": Array of 2-5 subject/content tags (e.g., "landscape", "portrait", "still life", "urban", "nature", "figure", "interior", "seascape", "floral", "architectural").
- "mood_tags": Array of 2-4 mood/atmosphere tags (e.g., "contemplative", "vibrant", "somber", "playful", "serene", "dramatic", "energetic", "intimate", "mysterious").
- "color_palette": Array of 3-5 dominant colors, each with "hex" (color code), "name" (common color name), "percentage" (estimated percentage as decimal, e.g., 0.35 for 35%).

Return ONLY valid JSON, no markdown code fences, no other text.`,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Parse JSON — handle potential markdown code fences
  let jsonText = textBlock.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  return JSON.parse(jsonText) as ArtworkAnalysis;
}
