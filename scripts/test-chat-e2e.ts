/**
 * End-to-end chat test suite — sends real questions through the full
 * Claude agentic loop and validates that tools were used and responses
 * contain expected content.
 *
 * Run: npx tsx --env-file=.env.local scripts/test-chat-e2e.ts
 *
 * Each test sends a message, collects SSE events, and checks:
 * - Which tools were called
 * - Whether the final response contains expected keywords/patterns
 * - Whether links are present in the expected format
 */

import Anthropic from "@anthropic-ai/sdk";
import { CHAT_TOOLS, executeTool } from "../src/lib/chat-tools";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are a knowledgeable assistant for Make Room Los Angeles, a contemporary art gallery. You help gallery staff research artworks, artists, and collectors using the gallery's CRM data.

Gallery overview:
- ~2,200 artworks in inventory across various mediums and price points
- ~240 represented artists
- ~4,000 contacts including collectors, curators, and art professionals

You have tools to search and query the gallery database. Use them to answer questions with specific data rather than general knowledge. When referencing records, always include links using the display_title field from search results, in the format [display_title](/inventory/ID), [Name](/artists/ID), or [Name](/contacts/ID). For artworks, always use the display_title (which includes artist, title, and year) rather than just the title field.

Be concise and gallery-professional. When presenting search results, summarize the key findings rather than listing every field. Highlight what's most relevant to the question asked.`;

interface TestCase {
  name: string;
  question: string;
  expectedTools: string[];          // Tools that should be called (at least one of these)
  expectedInResponse: string[];     // Strings/patterns that should appear in the response
  expectLinks?: boolean;            // Should contain markdown links (default true)
}

const tests: TestCase[] = [
  // --- Artwork discovery ---
  {
    name: "Basic artwork search",
    question: "Show me available paintings under $5,000",
    expectedTools: ["search_artworks"],
    expectedInResponse: ["available"],
    expectLinks: true,
  },
  {
    name: "Artist-specific artwork search",
    question: "What works do we have by Camilla Engström?",
    expectedTools: ["search_artworks", "search_artists"],
    expectedInResponse: ["Engström"],
    expectLinks: true,
  },
  {
    name: "Style-based artwork search",
    question: "Find abstract artworks in our inventory",
    expectedTools: ["search_artworks"],
    expectedInResponse: [],
    expectLinks: true,
  },

  // --- Collector/contact queries ---
  {
    name: "Preference-based collector search",
    question: "Which collectors are interested in abstract art?",
    expectedTools: ["search_contacts"],
    expectedInResponse: ["abstract"],
    expectLinks: true,
  },
  {
    name: "Contact lookup by name",
    question: "Look up the contact Sam Chen",
    expectedTools: ["search_contacts", "get_record"],
    expectedInResponse: ["Sam Chen"],
  },

  // --- Artist queries ---
  {
    name: "Artist lookup",
    question: "Tell me about the artist Yoab Vera",
    expectedTools: ["search_artists", "get_record"],
    expectedInResponse: ["Yoab Vera"],
    expectLinks: true,
  },

  // --- Cross-entity matching ---
  {
    name: "Collector-artist matching",
    question: "Which collectors would be a good fit for the work of Yoab Vera?",
    expectedTools: ["find_matches", "search_artists"],
    expectedInResponse: [],
    expectLinks: true,
  },
  {
    name: "Artwork recommendations for collector",
    question: "What artworks might Sam Chen be interested in based on their taste profile?",
    expectedTools: ["find_matches", "search_contacts", "get_record"],
    expectedInResponse: [],
    expectLinks: true,
  },

  // --- Similar artworks ---
  {
    name: "Visual similarity search",
    question: "Find artworks that look similar to inventory item 2327990",
    expectedTools: ["find_similar_artworks"],
    expectedInResponse: [],
    expectLinks: true,
  },

  // --- Stats and analytics ---
  {
    name: "Inventory statistics",
    question: "How many artworks do we have and what's the price range?",
    expectedTools: ["get_stats"],
    expectedInResponse: [],
    expectLinks: false,
  },
  {
    name: "Medium breakdown",
    question: "Give me a breakdown of our inventory by medium",
    expectedTools: ["get_stats"],
    expectedInResponse: [],
    expectLinks: false,
  },

  // --- Multi-step reasoning ---
  {
    name: "Curatorial question (multi-tool)",
    question: "I'm planning a show around the theme of nature and landscape. What available works would fit, and which collectors should we invite?",
    expectedTools: ["search_artworks", "search_contacts"],
    expectedInResponse: [],
    expectLinks: true,
  },
  {
    name: "Artist comparison",
    question: "Compare the price ranges and number of works we have for our top 3 artists by inventory count",
    expectedTools: ["get_stats", "search_artworks", "search_artists"],
    expectedInResponse: [],
  },
];

async function runAgenticLoop(question: string): Promise<{
  response: string;
  toolsCalled: string[];
  toolResults: Array<{ name: string; summary: string }>;
}> {
  const toolsCalled: string[] = [];
  const toolResults: Array<{ name: string; summary: string }> = [];

  let messages: Anthropic.MessageParam[] = [
    { role: "user", content: question },
  ];

  let maxLoops = 10;
  while (maxLoops-- > 0) {
    const result = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: CHAT_TOOLS,
      messages,
    });

    const toolUseBlocks = result.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const textBlocks = result.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );

    if (toolUseBlocks.length > 0) {
      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

      for (const toolCall of toolUseBlocks) {
        toolsCalled.push(toolCall.name);
        const { result: toolResult, summary } = await executeTool(
          toolCall.name,
          toolCall.input as Record<string, unknown>,
        );
        toolResults.push({ name: toolCall.name, summary });
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }

      messages = [
        ...messages,
        { role: "assistant", content: result.content },
        { role: "user", content: toolResultBlocks },
      ];
      continue;
    }

    // Final text response
    const response = textBlocks.map((b) => b.text).join("\n");
    return { response, toolsCalled, toolResults };
  }

  return { response: "(max loops reached)", toolsCalled, toolResults };
}

async function main() {
  console.log(`Running ${tests.length} end-to-end chat tests...\n`);
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const test of tests) {
    process.stdout.write(`  ${test.name}...`);
    const startTime = Date.now();

    try {
      const { response, toolsCalled, toolResults } = await runAgenticLoop(test.question);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const issues: string[] = [];

      // Check tools were called
      const usedExpected = test.expectedTools.some((t) => toolsCalled.includes(t));
      if (!usedExpected) {
        issues.push(
          `Expected one of [${test.expectedTools.join(", ")}] but got [${toolsCalled.join(", ") || "none"}]`,
        );
      }

      // Check response content
      for (const expected of test.expectedInResponse) {
        if (!response.toLowerCase().includes(expected.toLowerCase())) {
          issues.push(`Response missing expected: "${expected}"`);
        }
      }

      // Check links
      if (test.expectLinks !== false) {
        const hasLinks = /\[.+?\]\(\/.+?\)/.test(response);
        if (!hasLinks) {
          issues.push("Response has no markdown links");
        }
      }

      if (issues.length === 0) {
        console.log(` PASS (${elapsed}s, tools: ${toolsCalled.join("→")})`);
        passed++;
      } else {
        console.log(` FAIL (${elapsed}s)`);
        for (const issue of issues) {
          console.log(`        ✗ ${issue}`);
        }
        console.log(`        Tools: ${toolsCalled.join(" → ") || "none"}`);
        console.log(`        Tool summaries: ${toolResults.map((t) => t.summary).join("; ")}`);
        console.log(`        Response (first 200): ${response.substring(0, 200)}`);
        failed++;
        failures.push(test.name);
      }
    } catch (e) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(` ERROR (${elapsed}s)`);
      console.log(`        ${String(e)}`);
      failed++;
      failures.push(test.name);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed out of ${tests.length} tests`);
  if (failures.length > 0) {
    console.log(`\nFailed tests:`);
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main();
