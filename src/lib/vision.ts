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

export interface BusinessCardData {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  phone_mobile: string | null;
  company: string | null;
  website: string | null;
  title: string | null; // job title → maps to contact "type"
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  confidence: "high" | "medium" | "low";
}

export async function scanBusinessCard(
  images: string[],
  mediaType: string = "image/jpeg",
): Promise<BusinessCardData> {
  // Resize each image for Claude Vision
  const imageBlocks = await Promise.all(
    images.map(async (base64Str) => {
      const rawBuffer = Buffer.from(base64Str, "base64");
      const resized = await sharp(rawBuffer)
        .resize(VISION_MAX_SIZE, VISION_MAX_SIZE, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 90 })
        .toBuffer();

      return {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: mediaType as "image/jpeg",
          data: resized.toString("base64"),
        },
      };
    }),
  );

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          ...imageBlocks,
          {
            type: "text",
            text: `Extract contact information from this business card.${images.length > 1 ? " Two images are provided — they are the front and back of the same card. Combine information from both sides." : ""}

Return a JSON object with these fields:
- "first_name": string or null
- "last_name": string or null
- "email": string or null
- "phone": string or null (primary/office phone)
- "phone_mobile": string or null (mobile/cell phone, if a separate number is listed)
- "company": string or null
- "website": string or null
- "title": string or null (job title, e.g. "Gallery Director", "Curator")
- "street": string or null
- "city": string or null
- "state": string or null
- "zip": string or null
- "country": string or null
- "confidence": "high" if text is clearly legible and fields are unambiguous, "medium" if some fields are uncertain, "low" if significant guessing was required

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

  let jsonText = textBlock.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  return JSON.parse(jsonText) as BusinessCardData;
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
