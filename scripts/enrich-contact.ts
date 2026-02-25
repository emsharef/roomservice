import { enrichContact } from "../src/lib/enrichment";
import { createAdminClient } from "../src/lib/supabase/admin";

const contactId = parseInt(process.argv[2], 10);
if (!contactId) {
  console.error("Usage: npx tsx --env-file=.env.local scripts/enrich-contact.ts <contactId>");
  process.exit(1);
}

async function run() {
  const admin = createAdminClient();

  console.log(`Enriching contact ${contactId}...`);

  await admin
    .from("contacts_extended")
    .update({ enrichment_status: "researching", enrichment_error: null })
    .eq("contact_id", contactId);

  try {
    const enrichment = await enrichContact(contactId);

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

    const { collection_profile, confidence, ...briefWithoutExtracted } = enrichment;
    const briefToStore = {
      ...briefWithoutExtracted,
      art_world: {
        ...briefWithoutExtracted.art_world,
        board_memberships: undefined,
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

    console.log("Done! Stored enrichment for", enrichment.summary.slice(0, 100) + "...");
    console.log("Engagement:", extractedFields.engagement_level);
    console.log("Known artists:", extractedFields.known_artists.join(", "));
    console.log("Style:", extractedFields.style_preferences.join(", "));
    console.log("Confidence:", extractedFields.enrichment_confidence);
  } catch (e) {
    await admin
      .from("contacts_extended")
      .update({
        enrichment_status: "error",
        enrichment_error: String(e),
        updated_at: new Date().toISOString(),
      })
      .eq("contact_id", contactId);

    console.error("Failed:", e);
    process.exit(1);
  }
}

run();
