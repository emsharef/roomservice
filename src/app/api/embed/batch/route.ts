import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateImageEmbeddings } from "@/lib/embeddings";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Role check
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "staff"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { artworkIds } = await request.json();
  if (!artworkIds || !Array.isArray(artworkIds) || artworkIds.length === 0) {
    return NextResponse.json({ error: "artworkIds array is required" }, { status: 400 });
  }

  // Fetch artworks
  const { data: artworks, error: fetchError } = await admin
    .from("artworks")
    .select("id, title, primary_image_url")
    .in("id", artworkIds);

  if (fetchError || !artworks) {
    return NextResponse.json({ error: "Failed to fetch artworks" }, { status: 500 });
  }

  // Filter to those with images, preserve order matching artworkIds
  const artworksWithImages = artworks.filter((a) => a.primary_image_url);
  if (artworksWithImages.length === 0) {
    return NextResponse.json({ error: "No artworks with images" }, { status: 400 });
  }

  const imageUrls = artworksWithImages.map((a) => a.primary_image_url!);

  try {
    const { embeddings, errors } = await generateImageEmbeddings(imageUrls);

    const now = new Date().toISOString();
    const results: { artworkId: number; success: boolean; error?: string }[] = [];

    // Save each embedding to DB
    for (let i = 0; i < artworksWithImages.length; i++) {
      const artwork = artworksWithImages[i];
      const embedding = embeddings[i];
      const error = errors[i];

      if (embedding) {
        const { error: updateError } = await admin
          .from("artworks_extended")
          .update({
            clip_embedding: embedding,
            clip_generated_at: now,
            updated_at: now,
          })
          .eq("artwork_id", artwork.id);

        results.push({
          artworkId: artwork.id,
          success: !updateError,
          error: updateError?.message,
        });
      } else {
        // Mark error in DB
        await admin
          .from("artworks_extended")
          .update({
            enrichment_status: "error",
            enrichment_error: error || "Embedding generation failed",
            updated_at: now,
          })
          .eq("artwork_id", artwork.id);

        results.push({
          artworkId: artwork.id,
          success: false,
          error: error || "Embedding generation failed",
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success);

    return NextResponse.json({
      processed: results.length,
      succeeded,
      failed: failed.length,
      errors: failed,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
