import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncAll, type SyncProgress, type SyncMode } from "@/lib/sync";

export const maxDuration = 300; // 5 minutes max for serverless

export async function POST(request: Request) {
  // 1. Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Role check (staff or admin)
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "staff"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Parse mode
  let mode: SyncMode = "full";
  try {
    const body = await request.json();
    if (body.mode === "incremental") mode = "incremental";
  } catch {
    // No body = default to full
  }

  // For incremental, get updatedSince from the last successful "all" sync
  let updatedSince: string | undefined;
  if (mode === "incremental") {
    const { data: lastSync } = await admin
      .from("sync_log")
      .select("completed_at")
      .eq("entity_type", "all")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();
    updatedSince = lastSync?.completed_at ?? undefined;
  }

  // 4. Log sync start
  const { data: logEntry } = await admin
    .from("sync_log")
    .insert({
      entity_type: "all",
      direction: "pull",
      triggered_by: user.id,
    })
    .select()
    .single();

  // 5. Run sync with streaming to prevent timeout
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(data: Record<string, unknown>) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // stream closed
        }
      }

      const onProgress = (entity: string, progress: SyncProgress) => {
        sendEvent({ progress: { ...progress, entity } });
      };

      const heartbeat = setInterval(() => sendEvent({ heartbeat: true }), 10000);

      try {
        const results = await syncAll(mode, onProgress, updatedSince);

        const totalProcessed = results.reduce((s, r) => s + r.processed, 0);
        const totalCreated = results.reduce((s, r) => s + r.created, 0);
        const totalUpdated = results.reduce((s, r) => s + r.updated, 0);

        const allErrors = results.flatMap((r) => r.errors);
        if (logEntry) {
          await admin
            .from("sync_log")
            .update({
              status: "completed",
              records_processed: totalProcessed,
              records_created: totalCreated,
              records_updated: totalUpdated,
              completed_at: new Date().toISOString(),
              error: allErrors.length > 0
                ? `${allErrors.length} errors: ${allErrors.slice(0, 10).join("; ")}`
                : null,
            })
            .eq("id", logEntry.id);
        }

        clearInterval(heartbeat);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ success: true, results })}\n\n`)
        );
        controller.close();
      } catch (e) {
        clearInterval(heartbeat);

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

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: String(e) })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
