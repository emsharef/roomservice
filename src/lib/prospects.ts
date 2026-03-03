import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

/** Max dimension for Claude Vision (it downscales to 1568px internally) */
const VISION_MAX_SIZE = 1568;

export interface ParsedProspect {
  name: string;
  company: string | null;
  title: string | null;
  context: string | null;
}

const PARSE_PROMPT = `Parse the following into a list of people. For each person, extract:
- name (required — the person's full name)
- company (if visible)
- title/role (if visible)
- context (any other info: location, affiliation, etc.)

Handle various input formats: one name per line, "Name - Company", "Name, Title at Company", comma-separated lists, handwritten notes, printed directories, etc.

Return ONLY a JSON array: [{"name": "...", "company": "...", "title": "...", "context": "..."}]
No markdown code fences, no other text.`;

export async function parseProspectList(options: {
  text?: string;
  images?: string[];
  mediaType?: string;
}): Promise<ParsedProspect[]> {
  const { text, images, mediaType = "image/jpeg" } = options;

  const contentBlocks: Anthropic.MessageCreateParams["messages"][0]["content"] =
    [];

  // Build image content blocks if images are provided
  if (images && images.length > 0) {
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

    contentBlocks.push(...imageBlocks);
  }

  // Add text prompt (with optional user-provided text prepended)
  const promptText = text
    ? `${PARSE_PROMPT}\n\nInput:\n${text}`
    : PARSE_PROMPT;

  contentBlocks.push({ type: "text", text: promptText });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: contentBlocks,
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

  return JSON.parse(jsonText) as ParsedProspect[];
}
