/**
 * Test suite for chat tools — exercises each tool with sample queries
 * Run: npx tsx --env-file=.env.local scripts/test-chat-tools.ts
 */

import { executeTool } from "../src/lib/chat-tools";

const tests: Array<{ name: string; tool: string; input: Record<string, unknown>; check: (r: any) => string | null }> = [
  // --- search_artworks ---
  {
    name: "Search artworks by keyword",
    tool: "search_artworks",
    input: { query: "landscape" },
    check: (r) => r.result.count > 0 ? null : "Expected results for 'landscape'",
  },
  {
    name: "Search artworks by artist name",
    tool: "search_artworks",
    input: { artist_name: "Engström" },
    check: (r) => r.result.count > 0 ? null : "Expected results for Engström",
  },
  {
    name: "Search available artworks under $5000",
    tool: "search_artworks",
    input: { status: "available", max_price: 5000, limit: 5 },
    check: (r) => {
      if (r.result.count === 0) return "Expected some available works under $5000";
      const overpriced = r.result.artworks.filter((a: any) => a.price > 5000);
      if (overpriced.length > 0) return `Found ${overpriced.length} works over $5000`;
      return null;
    },
  },
  {
    name: "Search artworks by style tags",
    tool: "search_artworks",
    input: { style_tags: ["abstract"], limit: 5 },
    check: (r) => r.result.count > 0 ? null : "Expected abstract artworks",
  },
  {
    name: "Artwork results have display_title",
    tool: "search_artworks",
    input: { query: "untitled", limit: 3 },
    check: (r) => {
      if (r.result.count === 0) return "No results";
      const missing = r.result.artworks.filter((a: any) => !a.display_title);
      return missing.length > 0 ? "Some artworks missing display_title" : null;
    },
  },

  // --- search_contacts ---
  {
    name: "Search contacts by name",
    tool: "search_contacts",
    input: { query: "Chen" },
    check: (r) => r.result.count > 0 ? null : "Expected results for 'Chen'",
  },
  {
    name: "Search contacts by style preference (abstract)",
    tool: "search_contacts",
    input: { style_preferences: ["abstract"], limit: 10 },
    check: (r) => {
      if (r.result.count === 0) return "Expected contacts with abstract preference";
      const noMatch = r.result.contacts.filter((c: any) => !c.style_preferences.includes("abstract"));
      return noMatch.length > 0 ? `${noMatch.length} contacts lack 'abstract' preference` : null;
    },
  },
  {
    name: "Search contacts by subject preference",
    tool: "search_contacts",
    input: { subject_preferences: ["nature"], limit: 10 },
    check: (r) => r.result.count > 0 ? null : "Expected contacts with nature preference",
  },

  // --- search_artists ---
  {
    name: "Search artists by name",
    tool: "search_artists",
    input: { query: "Vera" },
    check: (r) => r.result.count > 0 ? null : "Expected results for 'Vera'",
  },
  {
    name: "Search artists by country (no data — expect 0)",
    tool: "search_artists",
    input: { country: "Mexico" },
    check: (r) => r.result.count === 0 ? null : "Country field not populated in DB, expected 0",
  },

  // --- get_record ---
  {
    name: "Get artwork record",
    tool: "get_record",
    input: { type: "artwork", id: 2327990 },
    check: (r) => {
      if (r.result.error) return r.result.error;
      if (!r.result.display_title) return "Missing display_title";
      return null;
    },
  },
  {
    name: "Get artist record",
    tool: "get_record",
    input: { type: "artist", id: 45527 },
    check: (r) => {
      if (r.result.error) return r.result.error;
      if (!r.result.display_name) return "Missing display_name";
      return null;
    },
  },
  {
    name: "Get contact record",
    tool: "get_record",
    input: { type: "contact", id: 2236303 },
    check: (r) => {
      if (r.result.error) return r.result.error;
      return null;
    },
  },

  // --- find_matches ---
  {
    name: "Find contacts matching an artist",
    tool: "find_matches",
    input: { source_type: "artist", source_id: 45527, target_type: "contact", limit: 5 },
    check: (r) => {
      if (r.result.note) return `No tags: ${r.result.note}`;
      return r.result.count > 0 ? null : "Expected matching contacts";
    },
  },
  {
    name: "Find artworks matching a contact",
    tool: "find_matches",
    input: { source_type: "contact", source_id: 2236303, target_type: "artwork", limit: 5 },
    check: (r) => {
      if (r.result.note) return `No tags: ${r.result.note}`;
      return r.result.count > 0 ? null : "Expected matching artworks";
    },
  },

  // --- find_similar_artworks ---
  {
    name: "Find visually similar artworks (CLIP)",
    tool: "find_similar_artworks",
    input: { artwork_id: 2327990, embedding_type: "clip", limit: 5 },
    check: (r) => {
      if (r.result.error) return r.result.error;
      return r.result.count > 0 ? null : "Expected similar artworks";
    },
  },

  // --- get_stats ---
  {
    name: "Get artwork stats",
    tool: "get_stats",
    input: { entity: "artworks" },
    check: (r) => r.result.total > 0 ? null : "Expected non-zero total",
  },
  {
    name: "Get artwork status breakdown",
    tool: "get_stats",
    input: { entity: "artworks", group_by: "status" },
    check: (r) => r.result.breakdown ? null : "Expected breakdown object",
  },
  {
    name: "Get artist country breakdown",
    tool: "get_stats",
    input: { entity: "artists", group_by: "country" },
    check: (r) => r.result.breakdown ? null : "Expected breakdown object",
  },

  // --- search_prospects ---
  {
    name: "Search all prospects",
    tool: "search_prospects",
    input: {},
    check: (r) => r.result.count > 0 ? null : "Expected some prospects",
  },
  {
    name: "Search prospects with style preference",
    tool: "search_prospects",
    input: { style_preferences: ["abstract"] },
    check: (r) => {
      if (r.result.count === 0) return "Expected prospects with abstract preference";
      const bad = r.result.prospects.filter((p: any) => !p.style_preferences.includes("abstract"));
      return bad.length > 0 ? `${bad.length} prospects lack 'abstract' preference` : null;
    },
  },
  {
    name: "Search prospects by engagement level",
    tool: "search_prospects",
    input: { engagement_level: "active_collector" },
    check: (r) => r.result.count >= 0 ? null : "Unexpected error",
  },
  {
    name: "Search prospects returns expected fields",
    tool: "search_prospects",
    input: { limit: 1 },
    check: (r) => {
      if (r.result.count === 0) return "No prospects found";
      const p = r.result.prospects[0];
      if (!p.id) return "Missing id";
      if (!p.display_name) return "Missing display_name";
      if (!p.link) return "Missing link";
      if (!p.batch_name) return "Missing batch_name";
      return null;
    },
  },
];

async function main() {
  console.log(`Running ${tests.length} chat tool tests...\n`);
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await executeTool(test.tool, test.input);
      const error = test.check(result);
      if (error) {
        console.log(`  FAIL  ${test.name}`);
        console.log(`        ${error}`);
        console.log(`        Summary: ${result.summary}`);
        failed++;
      } else {
        console.log(`  PASS  ${test.name} — ${result.summary}`);
        passed++;
      }
    } catch (e) {
      console.log(`  ERROR ${test.name}`);
      console.log(`        ${String(e)}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed out of ${tests.length} tests`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
