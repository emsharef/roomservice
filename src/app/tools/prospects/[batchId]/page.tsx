import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import BatchDetail from "./BatchDetail";

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const admin = createAdminClient();

  const { data: batch } = await admin
    .from("prospect_batches")
    .select("*")
    .eq("id", batchId)
    .single();

  if (!batch) notFound();

  const { data: prospects } = await admin
    .from("prospects")
    .select("*")
    .eq("batch_id", batchId)
    .order("display_name", { ascending: true });

  return (
    <BatchDetail
      batch={batch}
      initialProspects={prospects || []}
    />
  );
}
