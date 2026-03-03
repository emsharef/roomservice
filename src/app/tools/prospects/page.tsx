import { createAdminClient } from "@/lib/supabase/admin";
import ProspectsDashboard from "./ProspectsDashboard";

export default async function ProspectsPage() {
  const admin = createAdminClient();

  // Fetch batches
  const { data: batches } = await admin
    .from("prospect_batches")
    .select("id, name, source_type, prospect_count, created_at")
    .order("created_at", { ascending: false });

  // Fetch prospect status counts per batch
  const { data: prospects } = await admin
    .from("prospects")
    .select("id, batch_id, status");

  // Compute status summary per batch
  const statusMap = new Map<string, Record<string, number>>();
  for (const p of prospects || []) {
    const current = statusMap.get(p.batch_id) || {};
    current[p.status] = (current[p.status] || 0) + 1;
    statusMap.set(p.batch_id, current);
  }

  const batchesWithStatus = (batches || []).map((b) => ({
    ...b,
    statusSummary: statusMap.get(b.id) || {},
  }));

  return <ProspectsDashboard initialBatches={batchesWithStatus} />;
}
