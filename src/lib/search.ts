import { createAdminClient } from "@/lib/supabase/admin";
import { generateTextEmbedding, generateImageEmbedding } from "@/lib/embeddings";

export interface SearchParams {
  query?: string;           // text query like "blue abstract painting"
  imageUrl?: string;        // image URL for visual similarity
  artworkId?: number;       // "more like this"
  status?: string;
  minPrice?: number;
  maxPrice?: number;
  medium?: string;
  artistId?: number;
  limit?: number;
}

export interface SearchResult {
  artwork_id: number;
  title: string;
  year: string | null;
  medium: string | null;
  dimensions: string | null;
  price: number | null;
  price_currency: string | null;
  status: string | null;
  primary_image_url: string | null;
  artist_names: string | null;
  similarity: number;
  ai_description: string | null;
  style_tags: string[] | null;
  subject_tags: string[] | null;
}

export async function searchArtworks(params: SearchParams): Promise<SearchResult[]> {
  const supabase = createAdminClient();
  const limit = params.limit || 20;

  let embedding: number[] | null = null;
  let embeddingCol = "clip_embedding";

  if (params.artworkId) {
    // "More like this" — use existing artwork's CLIP embedding
    const { data } = await supabase
      .from("artworks_extended")
      .select("clip_embedding")
      .eq("artwork_id", params.artworkId)
      .single();

    if (!data?.clip_embedding) {
      throw new Error("Artwork has no CLIP embedding");
    }
    embedding = data.clip_embedding;

  } else if (params.imageUrl) {
    // Image similarity search
    embedding = await generateImageEmbedding(params.imageUrl);

  } else if (params.query) {
    // Text search — use description embedding space for better semantic results
    embedding = await generateTextEmbedding(params.query);
    embeddingCol = "description_embedding";
  }

  if (!embedding) {
    throw new Error("Must provide query, imageUrl, or artworkId");
  }

  // Call the Supabase RPC function
  const { data, error } = await supabase.rpc("search_artworks", {
    query_embedding: embedding,
    embedding_col: embeddingCol,
    match_count: limit,
    filter_status: params.status || null,
    filter_min_price: params.minPrice || null,
    filter_max_price: params.maxPrice || null,
    filter_medium: params.medium || null,
    filter_artist_id: params.artistId || null,
  });

  if (error) throw error;
  return (data || []) as SearchResult[];
}
