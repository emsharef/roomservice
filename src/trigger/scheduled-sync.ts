import { logger, schedules } from "@trigger.dev/sdk/v3";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncArtworks, syncArtists, syncContacts } from "@/lib/sync";
import { analyzeNewArtworks } from "./analyze-new-artworks";

export const scheduledSync = schedules.task({
  id: "scheduled-sync",
  cron: "0 */2 * * *", // Every 2 hours
  maxDuration: 1800, // 30 min max
  run: async () => {
    const admin = createAdminClient();

    // Log sync start
    const { data: logEntry } = await admin
      .from("sync_log")
      .insert({
        entity_type: "all",
        direction: "pull",
        status: "running",
        triggered_by: null, // scheduled
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    try {
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

      const artworksResult = await syncArtworks(syncOpts);
      logger.info("Artworks sync complete", {
        processed: artworksResult.processed,
        created: artworksResult.created,
        updated: artworksResult.updated,
      });

      const artistsResult = await syncArtists(syncOpts);
      logger.info("Artists sync complete", {
        processed: artistsResult.processed,
        created: artistsResult.created,
        updated: artistsResult.updated,
      });

      const contactsResult = await syncContacts(syncOpts);
      logger.info("Contacts sync complete", {
        processed: contactsResult.processed,
        created: contactsResult.created,
        updated: contactsResult.updated,
      });

      const totalProcessed =
        artworksResult.processed +
        artistsResult.processed +
        contactsResult.processed;
      const totalCreated =
        artworksResult.created +
        artistsResult.created +
        contactsResult.created;
      const totalUpdated =
        artworksResult.updated +
        artistsResult.updated +
        contactsResult.updated;

      // Log sync completion
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

      logger.info("Sync complete", {
        totalProcessed,
        totalCreated,
        totalUpdated,
      });

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
    } catch (e) {
      // Log sync error
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

      logger.error("Sync failed", { error: String(e) });
      throw e;
    }
  },
});
