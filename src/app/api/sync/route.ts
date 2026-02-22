import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncArtworks, syncArtists, syncContacts, type SyncProgress, type SyncOptions, type SyncMode } from "@/lib/sync";

export const maxDuration = 300; // 5 minutes max for serverless

export async function POST(request: NextRequest) {
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

  // 3. Parse entity type and sync mode
  const body = await request.json();
  const { entity, mode = "full", resumeOffset, updatedSince } = body as {
    entity?: string;
    mode?: SyncMode;
    resumeOffset?: number;
    updatedSince?: string;
  };

  if (!entity || !["artworks", "artists", "contacts"].includes(entity)) {
    return NextResponse.json(
      { error: "Invalid entity type. Must be one of: artworks, artists, contacts" },
      { status: 400 },
    );
  }

  // For incremental sync, auto-detect updatedSince from last successful sync if not provided
  let effectiveUpdatedSince = updatedSince;
  if (mode === "incremental" && !effectiveUpdatedSince) {
    const { data: lastSync } = await admin
      .from("sync_log")
      .select("completed_at")
      .eq("entity_type", entity)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();
    effectiveUpdatedSince = lastSync?.completed_at ?? undefined;
  }

  // 4. Log sync start
  const { data: logEntry } = await admin
    .from("sync_log")
    .insert({
      entity_type: entity,
      direction: "pull",
      triggered_by: user.id,
    })
    .select()
    .single();

  // 5. Run sync with streaming response to prevent timeout
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

      const syncOpts: SyncOptions = {
        mode,
        resumeOffset,
        updatedSince: effectiveUpdatedSince,
        onProgress: (progress: SyncProgress) => {
          sendEvent({ progress });
        },
      };

      try {
        let result;
        switch (entity) {
          case "artworks":
            result = await syncArtworks(syncOpts);
            break;
          case "artists":
            result = await syncArtists(syncOpts);
            break;
          case "contacts":
            result = await syncContacts(syncOpts);
            break;
        }

        if (logEntry) {
          await admin
            .from("sync_log")
            .update({
              status: "completed",
              records_processed: result!.processed,
              records_created: result!.created,
              records_updated: result!.updated,
              completed_at: new Date().toISOString(),
              error: result!.errors.length > 0
                ? `${result!.errors.length} errors: ${result!.errors.slice(0, 10).join("; ")}`
                : null,
            })
            .eq("id", logEntry.id);
        }

        clearInterval(heartbeat);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ success: true, result })}\n\n`)
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
