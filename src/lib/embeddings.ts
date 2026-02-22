import sharp from "sharp";

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;

/** Max dimension for embedding images */
const EMBED_MAX_SIZE = 768;

/**
 * Fetch an image URL and resize it for embedding.
 * Returns a base64 data URI (data:image/jpeg;base64,...).
 */
async function fetchAndResizeForEmbed(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const resized = await sharp(buffer)
    .resize(EMBED_MAX_SIZE, EMBED_MAX_SIZE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  return `data:image/jpeg;base64,${resized.toString("base64")}`;
}

/**
 * Generate embeddings for multiple images in a single Voyage API call.
 * Returns an array of { embedding, index } for successful items, plus errors.
 */
export async function generateImageEmbeddings(
  imageUrls: string[]
): Promise<{ embeddings: (number[] | null)[]; errors: (string | null)[] }> {
  if (!VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY is not set");
  }

  // Fetch and resize all images concurrently
  const results = await Promise.allSettled(
    imageUrls.map((url) => fetchAndResizeForEmbed(url))
  );

  const inputs: { content: { type: string; image_base64: string }[] }[] = [];
  const indexMap: number[] = []; // maps Voyage response index to original index
  const errors: (string | null)[] = new Array(imageUrls.length).fill(null);

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      inputs.push({ content: [{ type: "image_base64", image_base64: result.value }] });
      indexMap.push(i);
    } else {
      errors[i] = result.reason?.message || "Failed to fetch/resize image";
    }
  }

  const embeddings: (number[] | null)[] = new Array(imageUrls.length).fill(null);

  if (inputs.length === 0) {
    return { embeddings, errors };
  }

  const response = await fetch("https://api.voyageai.com/v1/multimodalembeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "voyage-multimodal-3.5",
      inputs,
      input_type: "document",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Voyage API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  for (let i = 0; i < data.data.length; i++) {
    embeddings[indexMap[i]] = data.data[i].embedding;
  }

  return { embeddings, errors };
}

export async function generateImageEmbedding(imageUrl: string): Promise<number[]> {
  if (!VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY is not set");
  }

  const dataUri = await fetchAndResizeForEmbed(imageUrl);

  const response = await fetch("https://api.voyageai.com/v1/multimodalembeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "voyage-multimodal-3.5",
      inputs: [{ content: [{ type: "image_base64", image_base64: dataUri }] }],
      input_type: "document",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Voyage API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

export async function generateTextEmbedding(text: string): Promise<number[]> {
  if (!VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY is not set");
  }

  const response = await fetch("https://api.voyageai.com/v1/multimodalembeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "voyage-multimodal-3.5",
      inputs: [{ content: [{ type: "text", text }] }],
      input_type: "query",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Voyage API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}
