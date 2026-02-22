// Script to run detail sync for artworks directly (bypasses API auth)
// Usage: npx tsx scripts/run-detail-sync.ts

import { syncArtworks, type SyncProgress } from "@/lib/sync";

async function main() {
  console.log("Starting artworks incremental sync (detail fetch for missing records)...");

  const result = await syncArtworks({
    mode: "incremental",
    onProgress: (progress: SyncProgress) => {
      if (progress.phase === "detailing") {
        process.stdout.write(`\rDetailing: ${progress.processed}/${progress.total}`);
      } else {
        console.log(`Phase: ${progress.phase}, processed: ${progress.processed}/${progress.total}`);
      }
    },
  });

  console.log("\n\nSync complete!");
  console.log(`Processed: ${result.processed}, Created: ${result.created}, Updated: ${result.updated}`);
  if (result.errors.length > 0) {
    console.log(`Errors (${result.errors.length}):`);
    result.errors.slice(0, 10).forEach((e) => console.log(`  - ${e}`));
  }

  // Send push notification
  try {
    await fetch("https://api.getmoshi.app/api/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "6vFtVgUWzKlv2T2Rf9xj7lDHdCJmuv27",
        title: "Artworks Detail Sync Done",
        message: `${result.processed} processed, ${result.errors.length} errors`,
      }),
    });
  } catch {}
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
