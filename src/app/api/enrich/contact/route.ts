import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrichContact } from "@/lib/enrichment";

export const maxDuration = 120; // web search can be slow

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

  const { contactId } = await request.json();

  if (!contactId || typeof contactId !== "number") {
    return NextResponse.json(
      { error: "contactId (number) is required" },
      { status: 400 },
    );
  }

  // Set status to researching
  await admin
    .from("contacts_extended")
    .update({ enrichment_status: "researching", enrichment_error: null })
    .eq("contact_id", contactId);

  try {
    const enrichment = await enrichContact(contactId);

    // Extract searchable fields into dedicated columns
    const cp = enrichment.collection_profile;
    const extractedFields = {
      engagement_level: cp?.engagement_level ?? null,
      known_artists: cp?.known_artists ?? [],
      style_preferences: cp?.style_preferences ?? [],
      subject_preferences: cp?.subject_preferences ?? [],
      mood_preferences: cp?.mood_preferences ?? [],
      board_memberships: enrichment.art_world?.board_memberships ?? [],
      enrichment_confidence: enrichment.confidence ?? null,
    };

    // Remove extracted fields from the blob to avoid duplication
    const { collection_profile, confidence, ...briefWithoutExtracted } = enrichment;
    const briefToStore = {
      ...briefWithoutExtracted,
      art_world: {
        ...briefWithoutExtracted.art_world,
        board_memberships: undefined, // stored in dedicated column
      },
    };

    await admin
      .from("contacts_extended")
      .update({
        collector_brief: briefToStore,
        enrichment_status: "draft",
        enrichment_error: null,
        ...extractedFields,
        updated_at: new Date().toISOString(),
      })
      .eq("contact_id", contactId);

    return NextResponse.json({ success: true, enrichment });
  } catch (e) {
    // Record error
    await admin
      .from("contacts_extended")
      .update({
        enrichment_status: "error",
        enrichment_error: String(e),
        updated_at: new Date().toISOString(),
      })
      .eq("contact_id", contactId);

    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
