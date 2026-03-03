import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrichProspect } from "@/lib/enrichment";

export const maxDuration = 120;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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

  // Set status to researching
  await admin
    .from("prospects")
    .update({ status: "researching", error_message: null, updated_at: new Date().toISOString() })
    .eq("id", id);

  try {
    const enrichment = await enrichProspect(id);

    // Extract fields into dedicated columns on the prospects table
    await admin
      .from("prospects")
      .update({
        first_name: enrichment.first_name || null,
        last_name: enrichment.last_name || null,
        display_name: enrichment.display_name || null,
        email: enrichment.email || null,
        phone: enrichment.phone || null,
        website: enrichment.website || null,
        company: enrichment.company || null,
        title: enrichment.title || null,
        location: enrichment.location || null,
        photo_url: enrichment.photo_url || null,
        linkedin: enrichment.linkedin || null,
        instagram: enrichment.instagram || null,
        other_socials: enrichment.other_socials ?? [],
        research_summary: enrichment.summary,
        confidence: enrichment.confidence,
        style_preferences: enrichment.collection_profile?.style_preferences ?? [],
        subject_preferences: enrichment.collection_profile?.subject_preferences ?? [],
        mood_preferences: enrichment.collection_profile?.mood_preferences ?? [],
        known_artists: enrichment.art_world?.known_artists ?? [],
        engagement_level: enrichment.collection_profile?.engagement_level ?? null,
        board_memberships: enrichment.art_world?.board_memberships ?? [],
        collection_mentions: enrichment.art_world?.collection_mentions ?? [],
        art_events: enrichment.art_world?.art_events ?? [],
        advisory_roles: enrichment.art_world?.advisory_roles ?? [],
        foundations: enrichment.philanthropy?.foundations ?? [],
        notable_giving: enrichment.philanthropy?.notable_giving ?? [],
        sources: enrichment.sources ?? [],
        // Store the remaining blob in research_brief (strip extracted fields to avoid duplication)
        research_brief: {
          professional: enrichment.professional,
          notes: enrichment.notes,
        },
        status: "done",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ success: true, enrichment });
  } catch (e) {
    // Record error
    await admin
      .from("prospects")
      .update({
        status: "error",
        error_message: String(e),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
