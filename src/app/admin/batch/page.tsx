import { createAdminClient } from "@/lib/supabase/admin";
import BatchDashboard from "./BatchDashboard";

export default async function BatchPage() {
  const admin = createAdminClient();

  const [totalResult, withImagesResult, embeddedResult, analyzedResult] =
    await Promise.all([
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
    ]);

  return (
    <BatchDashboard
      stats={{
        total: totalResult.count ?? 0,
        withImages: withImagesResult.count ?? 0,
        embedded: embeddedResult.count ?? 0,
        analyzed: analyzedResult.count ?? 0,
      }}
    />
  );
}
