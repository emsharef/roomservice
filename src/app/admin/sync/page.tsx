import { createAdminClient } from "@/lib/supabase/admin";
import SyncDashboard from "./SyncDashboard";

interface SyncLogEntry {
  id: number;
  entity_type: string;
  direction: string;
  status: string;
  records_processed: number;
  records_created: number;
  records_updated: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  triggered_by: string | null;
}

export default async function SyncPage() {
  const admin = createAdminClient();

  // Fetch record counts in parallel
  const [artworksCount, artistsCount, contactsCount] = await Promise.all([
    admin.from("artworks").select("*", { count: "exact", head: true }),
    admin.from("artists").select("*", { count: "exact", head: true }),
    admin.from("contacts").select("*", { count: "exact", head: true }),
  ]);

  // Fetch last completed sync per entity type
  const entityTypes = ["artworks", "artists", "contacts"];
  const lastSyncs: Record<string, SyncLogEntry | null> = {};

  for (const entity of entityTypes) {
    const { data } = await admin
      .from("sync_log")
      .select("*")
      .eq("entity_type", entity)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();

    lastSyncs[entity] = (data as SyncLogEntry) ?? null;
  }

  // Fetch recent sync log entries
  const { data: recentLogs } = await admin
    .from("sync_log")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(10);

  return (
    <SyncDashboard
      counts={{
        artworks: artworksCount.count ?? 0,
        artists: artistsCount.count ?? 0,
        contacts: contactsCount.count ?? 0,
      }}
      lastSyncs={lastSyncs}
      recentLogs={(recentLogs as SyncLogEntry[]) ?? []}
    />
  );
}
