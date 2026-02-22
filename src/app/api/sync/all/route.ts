import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncAll } from "@/lib/sync";

export async function POST() {
  // 1. Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Role check (staff or admin)
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "staff"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Log sync start
  const { data: logEntry } = await admin
    .from("sync_log")
    .insert({
      entity_type: "all",
      direction: "pull",
      triggered_by: user.id,
    })
    .select()
    .single();

  // 4. Run sync
  try {
    const results = await syncAll();

    const totalProcessed = results.reduce((s, r) => s + r.processed, 0);
    const totalCreated = results.reduce((s, r) => s + r.created, 0);
    const totalUpdated = results.reduce((s, r) => s + r.updated, 0);

    // 5. Update sync log on success
    if (logEntry) {
      await admin
        .from("sync_log")
        .update({
          status: "completed",
          records_processed: totalProcessed,
          records_created: totalCreated,
          records_updated: totalUpdated,
          completed_at: new Date().toISOString(),
        })
        .eq("id", logEntry.id);
    }

    return NextResponse.json({ success: true, results });
  } catch (e) {
    // Update sync log on error
    if (logEntry) {
      await admin
        .from("sync_log")
        .update({
          status: "error",
          error: String(e),
          completed_at: new Date().toISOString(),
        })
        .eq("id", logEntry.id);
    }

    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
