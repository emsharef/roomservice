import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrichArtist } from "@/lib/enrichment";

export const maxDuration = 120;

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

  const { artistId } = await request.json();

  if (!artistId || typeof artistId !== "number") {
    return NextResponse.json(
      { error: "artistId (number) is required" },
      { status: 400 },
    );
  }

  // Set status to researching
  await admin
    .from("artists_extended")
    .update({ enrichment_status: "researching", enrichment_error: null })
    .eq("artist_id", artistId);

  try {
    const enrichment = await enrichArtist(artistId);

    // Extract fields into dedicated columns
    const ap = enrichment.artistic_practice;
    const extractedFields = {
      primary_mediums: ap?.primary_mediums ?? [],
      style_tags: ap?.style_tags ?? [],
      subject_tags: ap?.subject_tags ?? [],
      mood_tags: ap?.mood_tags ?? [],
      enrichment_confidence: enrichment.confidence ?? null,
    };

    // Compose market_context from market data
    const m = enrichment.market;
    const marketParts: string[] = [];
    if (m?.market_trajectory) marketParts.push(`Trajectory: ${m.market_trajectory}`);
    if (m?.price_range) marketParts.push(`Price range: ${m.price_range}`);
    if (m?.gallery_representation?.length) {
      marketParts.push(`Represented by: ${m.gallery_representation.join("; ")}`);
    }
    const marketContext = marketParts.length > 0 ? marketParts.join(". ") : null;

    // Remove extracted fields from the blob to avoid duplication
    const {
      formatted_bio: _fb,
      confidence: _conf,
      artistic_practice,
      market,
      ...briefRest
    } = enrichment;

    // Strip extracted sub-fields but keep the rest of artistic_practice and market in the blob
    const briefToStore = {
      ...briefRest,
      artistic_practice: {
        philosophy: artistic_practice?.philosophy,
        process: artistic_practice?.process,
        themes: artistic_practice?.themes,
        evolution: artistic_practice?.evolution,
        influences: artistic_practice?.influences,
        // primary_mediums, style_tags, subject_tags, mood_tags stored in dedicated columns
      },
      market: {
        auction_results: market?.auction_results,
        // gallery_representation, price_range, market_trajectory composed into market_context
      },
    };

    await admin
      .from("artists_extended")
      .update({
        enrichment_brief: briefToStore,
        formatted_bio: enrichment.formatted_bio,
        market_context: marketContext,
        enrichment_status: "draft",
        enrichment_error: null,
        ...extractedFields,
        updated_at: new Date().toISOString(),
      })
      .eq("artist_id", artistId);

    return NextResponse.json({ success: true, enrichment });
  } catch (e) {
    // Record error
    await admin
      .from("artists_extended")
      .update({
        enrichment_status: "error",
        enrichment_error: String(e),
        updated_at: new Date().toISOString(),
      })
      .eq("artist_id", artistId);

    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
