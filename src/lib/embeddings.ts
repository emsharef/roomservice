const JINA_API_KEY = process.env.JINA_API_KEY;

export async function generateImageEmbedding(imageUrl: string): Promise<number[]> {
  if (!JINA_API_KEY) {
    throw new Error("JINA_API_KEY is not set");
  }

  const response = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${JINA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "jina-clip-v2",
      input: [{ image: imageUrl }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jina API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

export async function generateTextEmbedding(text: string): Promise<number[]> {
  if (!JINA_API_KEY) {
    throw new Error("JINA_API_KEY is not set");
  }

  const response = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${JINA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "jina-clip-v2",
      input: [{ text }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Jina API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}
