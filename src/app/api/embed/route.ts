import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateImageEmbedding } from "@/lib/embeddings";

export async function POST(request: NextRequest) {
  // 1. Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Role check (staff or admin)
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "staff"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Parse and validate request body
  const { artworkId } = await request.json();
  if (!artworkId) {
    return NextResponse.json({ error: "artworkId is required" }, { status: 400 });
  }

  // 4. Get artwork from Supabase
  const { data: artwork, error: artworkError } = await admin
    .from("artworks")
    .select("id, title, primary_image_url")
    .eq("id", artworkId)
    .single();

  if (artworkError || !artwork) {
    return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
  }

  if (!artwork.primary_image_url) {
    return NextResponse.json({ error: "Artwork has no image" }, { status: 400 });
  }

  try {
    // 5. Generate CLIP embedding via Jina API
    const embedding = await generateImageEmbedding(artwork.primary_image_url);

    // 6. Store in artworks_extended
    const { error: updateError } = await admin
      .from("artworks_extended")
      .update({
        clip_embedding: embedding,
        clip_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("artwork_id", artworkId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      artworkId,
      embeddingDimension: embedding.length,
    });
  } catch (e) {
    // Update error status in artworks_extended
    await admin
      .from("artworks_extended")
      .update({
        enrichment_status: "error",
        enrichment_error: String(e),
        updated_at: new Date().toISOString(),
      })
      .eq("artwork_id", artworkId);

    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
