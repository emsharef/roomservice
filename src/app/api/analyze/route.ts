import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeArtwork } from "@/lib/vision";
import { generateTextEmbedding } from "@/lib/embeddings";

export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Role check (staff or admin)
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "staff"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { artworkId } = await request.json();
  if (!artworkId) {
    return NextResponse.json(
      { error: "artworkId is required" },
      { status: 400 }
    );
  }

  // Get artwork with artist info
  const { data: artwork, error: artworkError } = await admin
    .from("artworks")
    .select(
      "id, title, medium, primary_image_url, artwork_artists(display_name)"
    )
    .eq("id", artworkId)
    .single();

  if (artworkError || !artwork) {
    return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
  }

  if (!artwork.primary_image_url) {
    return NextResponse.json(
      { error: "Artwork has no image" },
      { status: 400 }
    );
  }

  // Set status to processing
  await admin
    .from("artworks_extended")
    .update({
      enrichment_status: "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("artwork_id", artworkId);

  try {
    const artistNames =
      (artwork.artwork_artists || [])
        .map((a: { display_name: string }) => a.display_name)
        .join(", ") || "Unknown artist";

    // Run Claude Vision analysis
    const analysis = await analyzeArtwork(
      artwork.primary_image_url,
      artwork.title,
      artistNames,
      artwork.medium
    );

    // Also generate a text embedding of the description for semantic search
    let descriptionEmbedding: number[] | null = null;
    try {
      if (analysis.description && process.env.VOYAGE_API_KEY) {
        descriptionEmbedding = await generateTextEmbedding(
          analysis.description
        );
      }
    } catch (embError) {
      // Non-fatal -- we still save the analysis even if embedding fails
      console.error("Description embedding failed:", embError);
    }

    // Store in artworks_extended
    const updateData: Record<string, unknown> = {
      ai_description: analysis.description,
      style_tags: analysis.style_tags,
      subject_tags: analysis.subject_tags,
      mood_tags: analysis.mood_tags,
      color_palette: analysis.color_palette,
      vision_analyzed_at: new Date().toISOString(),
      enrichment_status: "complete",
      enrichment_error: null,
      updated_at: new Date().toISOString(),
    };

    if (descriptionEmbedding) {
      updateData.description_embedding = descriptionEmbedding;
    }

    const { error: updateError } = await admin
      .from("artworks_extended")
      .update(updateData)
      .eq("artwork_id", artworkId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      artworkId,
      analysis,
      hasDescriptionEmbedding: !!descriptionEmbedding,
    });
  } catch (e) {
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
