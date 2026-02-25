import { createAdminClient } from "@/lib/supabase/admin";
import BatchDashboard from "./BatchDashboard";

export default async function BatchPage() {
  const admin = createAdminClient();

  const [
    totalResult,
    withImagesResult,
    embeddedResult,
    analyzedResult,
    // Contact enrichment stats
    collectorsResult,
    enrichedResult,
    // Artist enrichment stats
    artistsResult,
    artistsEnrichedResult,
  ] = await Promise.all([
    admin.from("artworks").select("*", { count: "exact", head: true }),
    admin
      .from("artworks")
      .select("*", { count: "exact", head: true })
      .not("primary_image_url", "is", null),
    admin
      .from("artworks_extended")
      .select("*", { count: "exact", head: true })
      .not("clip_embedding", "is", null),
    admin
      .from("artworks_extended")
      .select("*", { count: "exact", head: true })
      .not("vision_analyzed_at", "is", null),
    // Contacts classified as collector
    admin
      .from("contacts_extended")
      .select("*", { count: "exact", head: true })
      .eq("classification", "collector"),
    // Collectors that have been enriched (have collector_brief)
    admin
      .from("contacts_extended")
      .select("*", { count: "exact", head: true })
      .eq("classification", "collector")
      .not("collector_brief", "is", null),
    // Total artists
    admin
      .from("artists_extended")
      .select("*", { count: "exact", head: true }),
    // Artists that have been enriched (have enrichment_brief)
    admin
      .from("artists_extended")
      .select("*", { count: "exact", head: true })
      .not("enrichment_brief", "is", null),
  ]);

  return (
    <BatchDashboard
      stats={{
        total: totalResult.count ?? 0,
        withImages: withImagesResult.count ?? 0,
        embedded: embeddedResult.count ?? 0,
        analyzed: analyzedResult.count ?? 0,
        collectors: collectorsResult.count ?? 0,
        collectorsEnriched: enrichedResult.count ?? 0,
        artists: artistsResult.count ?? 0,
        artistsEnriched: artistsEnrichedResult.count ?? 0,
      }}
    />
  );
}
