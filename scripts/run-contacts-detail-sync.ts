// Script to run contacts detail sync (bypasses API auth)
// Usage: npx tsx --env-file=.env.local scripts/run-contacts-detail-sync.ts

import { syncContacts, type SyncProgress } from "@/lib/sync";

async function main() {
  console.log("Starting contacts incremental sync (detail fetch for missing records)...");

  const result = await syncContacts({
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

  try {
    if (!process.env.MOSHI_WEBHOOK_TOKEN) return;
    await fetch("https://api.getmoshi.app/api/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: process.env.MOSHI_WEBHOOK_TOKEN,
        title: "Contacts Detail Sync Done",
        message: `${result.processed} processed, ${result.errors.length} errors`,
      }),
    });
  } catch {}
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
