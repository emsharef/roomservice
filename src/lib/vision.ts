import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

/** Max dimension for Claude Vision (it downscales to 1568px internally) */
const VISION_MAX_SIZE = 1568;

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
  // Fetch the image and resize for Claude Vision
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image: ${imageResponse.status}`);
  }
  const rawBuffer = Buffer.from(await imageResponse.arrayBuffer());

  const resized = await sharp(rawBuffer)
    .resize(VISION_MAX_SIZE, VISION_MAX_SIZE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();

  const base64 = resized.toString("base64");
  const mediaType = "image/jpeg" as const;

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
