import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncArtworks, syncArtists, syncContacts, type SyncProgress, type SyncMode, type SyncOptions, type SyncResult } from "@/lib/sync";

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

  // For incremental, get updatedSince from the last successful sync
  let updatedSince: string | undefined;
  if (mode === "incremental") {
    const { data: lastSync } = await admin
      .from("sync_log")
      .select("completed_at")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();
    updatedSince = lastSync?.completed_at ?? undefined;
  }

  // 4. Run each entity sync with individual log entries
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

      const heartbeat = setInterval(() => sendEvent({ heartbeat: true }), 10000);

      const entities: Array<{ name: string; syncFn: (opts: SyncOptions) => Promise<SyncResult> }> = [
        { name: "artworks", syncFn: syncArtworks },
        { name: "artists", syncFn: syncArtists },
        { name: "contacts", syncFn: syncContacts },
      ];

      const results: SyncResult[] = [];

      try {
        for (const { name, syncFn } of entities) {
          const { data: logEntry } = await admin
            .from("sync_log")
            .insert({
              entity_type: name,
              direction: "pull",
              triggered_by: user.id,
            })
            .select()
            .single();

          try {
            const result = await syncFn({
              mode,
              updatedSince,
              onProgress: (progress: SyncProgress) => {
                sendEvent({ progress: { ...progress, entity: name } });
              },
            });

            if (logEntry) {
              await admin
                .from("sync_log")
                .update({
                  status: "completed",
                  records_processed: result.processed,
                  records_created: result.created,
                  records_updated: result.updated,
                  completed_at: new Date().toISOString(),
                  error: result.errors.length > 0
                    ? `${result.errors.length} errors: ${result.errors.slice(0, 10).join("; ")}`
                    : null,
                })
                .eq("id", logEntry.id);
            }

            results.push(result);
          } catch (e) {
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
            throw e;
          }
        }

        clearInterval(heartbeat);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ success: true, results })}\n\n`)
        );
        controller.close();
      } catch (e) {
        clearInterval(heartbeat);
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
