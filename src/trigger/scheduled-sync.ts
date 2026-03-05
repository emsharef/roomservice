import { logger, schedules } from "@trigger.dev/sdk/v3";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncArtworks, syncArtists, syncContacts } from "@/lib/sync";
import { analyzeNewArtworks } from "./analyze-new-artworks";

async function logSyncEntity(
  admin: ReturnType<typeof createAdminClient>,
  entityType: string,
  syncFn: (opts: { mode: "incremental"; updatedSince?: string }) => Promise<{ processed: number; created: number; updated: number; errors: string[] }>,
  syncOpts: { mode: "incremental"; updatedSince?: string },
) {
  const { data: logEntry } = await admin
    .from("sync_log")
    .insert({
      entity_type: entityType,
      direction: "pull",
      status: "running",
      triggered_by: null,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  try {
    const result = await syncFn(syncOpts);

    if (logEntry) {
      await admin
        .from("sync_log")
        .update({
          status: "completed",
          records_processed: result.processed,
          records_created: result.created,
          records_updated: result.updated,
          error: result.errors.length > 0
            ? `${result.errors.length} errors: ${result.errors.slice(0, 10).join("; ")}`
            : null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", logEntry.id);
    }

    logger.info(`${entityType} sync complete`, {
      processed: result.processed,
      created: result.created,
      updated: result.updated,
    });

    return result;
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

export const scheduledSync = schedules.task({
  id: "scheduled-sync",
  cron: "0 */2 * * *", // Every 2 hours
  maxDuration: 1800, // 30 min max
  run: async () => {
    const admin = createAdminClient();

    // Find last successful sync to determine updatedSince cutoff
    const { data: lastSync } = await admin
      .from("sync_log")
      .select("completed_at")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();

    const updatedSince = lastSync?.completed_at ?? undefined;
    logger.info("Starting incremental sync for all entities", {
      updatedSince: updatedSince ?? "none (first run — full fetch)",
    });

    const syncOpts = { mode: "incremental" as const, updatedSince };

    const artworksResult = await logSyncEntity(admin, "artworks", syncArtworks, syncOpts);
    const artistsResult = await logSyncEntity(admin, "artists", syncArtists, syncOpts);
    const contactsResult = await logSyncEntity(admin, "contacts", syncContacts, syncOpts);

    // If new artworks were synced, trigger auto-analysis
    if (artworksResult.created > 0) {
      logger.info(
        `Triggering analysis for ${artworksResult.created} new artworks`
      );
      await analyzeNewArtworks.trigger();
    }

    return {
      artworks: artworksResult,
      artists: artistsResult,
      contacts: contactsResult,
    };
  },
});
