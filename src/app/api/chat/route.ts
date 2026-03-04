import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";
import { CHAT_TOOLS, executeTool } from "@/lib/chat-tools";

export const maxDuration = 300;

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are a knowledgeable assistant for Make Room Los Angeles, a contemporary art gallery. You help gallery staff research artworks, artists, and collectors using the gallery's CRM data.

Gallery overview:
- ~2,200 artworks in inventory across various mediums and price points
- ~240 represented artists
- ~4,000 contacts including collectors, curators, and art professionals
- Prospect research batches with researched potential collectors (separate from CRM contacts)

You have tools to search and query the gallery database. Use them to answer questions with specific data rather than general knowledge. When referencing records, always include links using the display_title field from search results, in the format [display_title](/inventory/ID), [Name](/artists/ID), or [Name](/contacts/ID). For artworks, always use the display_title (which includes artist, title, and year) rather than just the title field.

Be concise and gallery-professional. When presenting search results, summarize the key findings rather than listing every field. Highlight what's most relevant to the question asked.

You can display any result as a visual card (with image, tags, price, etc.) by writing <<card:LINK>> where LINK is the exact link path from the search result. For example: <<card:/inventory/12345>>, <<card:/artists/678>>, <<card:/contacts/999>>, or <<card:/tools/prospects/BATCH_ID#p-UUID>>. Always use the exact link field from the result — do not construct links yourself. Use cards to highlight key results visually — for example, top recommendations or specific artworks you're drawing attention to. Use regular markdown links [text](/path) for simple references or long lists. You can mix cards and text freely.`;

// Extract displayable card data from tool results
function extractCards(toolName: string, result: Record<string, unknown>): unknown[] | null {
  if (toolName === "search_artworks") {
    const artworks = result.artworks as any[];
    if (!artworks?.length) return null;
    return artworks.map((a) => ({
      type: "artwork",
      id: a.id,
      title: a.display_title || a.title || "Untitled",
      subtitle: [a.medium, a.year].filter(Boolean).join(", "),
      image: a.primary_image_url,
      price: a.price,
      status: a.status,
      link: a.link,
    }));
  }

  if (toolName === "find_similar_artworks") {
    const artworks = result.similar_artworks as any[];
    if (!artworks?.length) return null;
    return artworks.map((a) => ({
      type: "artwork",
      id: a.id,
      title: a.display_title || a.title || "Untitled",
      subtitle: [a.medium, a.year].filter(Boolean).join(", "),
      image: a.primary_image_url,
      price: a.price,
      status: a.status,
      link: a.link,
    }));
  }

  if (toolName === "find_matches") {
    const matches = result.matches as any[];
    if (!matches?.length) return null;
    // Could be artworks or contacts
    if (matches[0].primary_image_url || matches[0].medium) {
      return matches.map((a) => ({
        type: "artwork",
        id: a.id,
        title: a.display_title || a.title || "Untitled",
        subtitle: [a.medium, a.year].filter(Boolean).join(", "),
        image: a.primary_image_url,
        price: a.price,
        status: a.status,
        link: a.link,
      }));
    }
    return matches.map((c) => ({
      type: "contact",
      id: c.id,
      title: c.display_name,
      subtitle: [c.company, c.location].filter(Boolean).join(" · "),
      tags: c.matching_tags?.style || c.style_preferences || [],
      link: c.link,
    }));
  }

  if (toolName === "search_contacts") {
    const contacts = result.contacts as any[];
    if (!contacts?.length) return null;
    return contacts.map((c) => ({
      type: "contact",
      id: c.id,
      title: c.display_name,
      subtitle: [c.company, c.location].filter(Boolean).join(" · "),
      email: c.email,
      tags: c.style_preferences || [],
      engagement: c.engagement_level,
      link: c.link,
    }));
  }

  if (toolName === "search_artists") {
    const artists = result.artists as any[];
    if (!artists?.length) return null;
    return artists.map((a) => ({
      type: "artist",
      id: a.id,
      title: a.display_name,
      subtitle: [a.country, a.life_dates].filter(Boolean).join(" · "),
      workCount: a.work_count,
      link: a.link,
    }));
  }

  if (toolName === "search_prospects") {
    const prospects = result.prospects as any[];
    if (!prospects?.length) return null;
    return prospects.map((p) => ({
      type: "prospect",
      id: p.id,
      title: p.display_name,
      subtitle: [p.title, p.company].filter(Boolean).join(", "),
      location: p.location,
      tags: p.style_preferences || [],
      engagement: p.engagement_level,
      link: p.link,
    }));
  }

  if (toolName === "get_prospect") {
    if (result.error || !result.link) return null;
    return [{
      type: "prospect",
      id: result.id,
      title: (result as any).display_name || (result as any).input_name,
      subtitle: [(result as any).title, (result as any).company].filter(Boolean).join(", "),
      location: (result as any).location,
      tags: (result as any).style_preferences || [],
      engagement: (result as any).engagement_level,
      link: result.link as string,
    }];
  }

  if (toolName === "get_record") {
    if (result.error) return null;
    const r = result as any;
    if (r.link?.startsWith("/inventory/")) {
      return [{
        type: "artwork",
        id: r.id,
        title: r.display_title || r.title || "Untitled",
        subtitle: [r.medium, r.year].filter(Boolean).join(", "),
        image: r.primary_image_url,
        price: r.price,
        status: r.status,
        link: r.link,
      }];
    }
    if (r.link?.startsWith("/contacts/")) {
      return [{
        type: "contact",
        id: r.id,
        title: r.display_name,
        subtitle: [r.company, r.location].filter(Boolean).join(" · "),
        email: r.email,
        link: r.link,
      }];
    }
    if (r.link?.startsWith("/artists/")) {
      return [{
        type: "artist",
        id: r.id,
        title: r.display_name,
        subtitle: [r.country, r.life_dates].filter(Boolean).join(" · "),
        link: r.link,
      }];
    }
  }

  return null;
}

// POST — send message and stream response
export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "staff"].includes(profile.role)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const { conversationId, message } = body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // stream closed
        }
      }

      const heartbeat = setInterval(() => send({ type: "heartbeat" }), 10000);

      try {
        // Get or create conversation
        let convId = conversationId;
        if (!convId) {
          const { data: conv, error: convError } = await admin
            .from("chat_conversations")
            .insert({ created_by: user.id })
            .select("id")
            .single();
          if (convError || !conv) throw new Error("Failed to create conversation");
          convId = conv.id;
        } else {
          // Update timestamp
          await admin
            .from("chat_conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", convId);
        }

        send({ type: "conversation_id", conversationId: convId });

        // Save user message
        await admin.from("chat_messages").insert({
          conversation_id: convId,
          role: "user",
          content: message.trim(),
        });

        // Load conversation history (last 50 messages, user + assistant only for Claude)
        const { data: history } = await admin
          .from("chat_messages")
          .select("role, content, tool_data")
          .eq("conversation_id", convId)
          .in("role", ["user", "assistant"])
          .order("created_at", { ascending: true })
          .limit(50);

        // Build messages array for Claude
        const messages: Anthropic.MessageParam[] = (history || []).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        // Agentic tool-use loop
        let loopMessages = [...messages];
        let maxLoops = 10;
        // Accumulate card data across tool calls for the final assistant message
        const accumulatedCards: Record<string, unknown> = {};

        while (maxLoops-- > 0) {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: CHAT_TOOLS,
            messages: loopMessages,
          });

          // Check for tool use
          const toolUseBlocks = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );
          const textBlocks = response.content.filter(
            (b): b is Anthropic.TextBlock => b.type === "text",
          );

          if (toolUseBlocks.length > 0) {
            // Process tool calls
            const toolResults: Anthropic.ToolResultBlockParam[] = [];

            for (const toolCall of toolUseBlocks) {
              send({ type: "status", text: `Using ${toolCall.name}...` });

              const { result, summary } = await executeTool(
                toolCall.name,
                toolCall.input as Record<string, unknown>,
              );

              // Save tool call + result to DB
              await admin.from("chat_messages").insert({
                conversation_id: convId,
                role: "tool_call",
                content: summary,
                tool_data: { name: toolCall.name, input: toolCall.input, result },
              });

              toolResults.push({
                type: "tool_result",
                tool_use_id: toolCall.id,
                content: JSON.stringify(result),
              });

              // Extract and accumulate displayable card data
              const cards = extractCards(toolCall.name, result as Record<string, unknown>);
              if (cards) {
                for (const card of cards) {
                  const c = card as Record<string, unknown>;
                  if (c.link) accumulatedCards[c.link as string] = c;
                }
              }
              send({ type: "tool_result", tool: toolCall.name, summary, cards });
            }

            // Continue the loop with tool results
            loopMessages = [
              ...loopMessages,
              { role: "assistant", content: response.content },
              { role: "user", content: toolResults },
            ];

            continue;
          }

          // Final text response — send with accumulated card data
          const finalText = textBlocks.map((b) => b.text).join("\n");

          if (finalText) {
            // Save assistant message
            await admin.from("chat_messages").insert({
              conversation_id: convId,
              role: "assistant",
              content: finalText,
            });

            const cardArray = Object.values(accumulatedCards);
            send({ type: "assistant", content: finalText, cards: cardArray.length > 0 ? cardArray : null });
          }

          // Auto-title: if this is the first exchange (no title yet)
          const { data: conv } = await admin
            .from("chat_conversations")
            .select("title")
            .eq("id", convId)
            .single();

          if (!conv?.title) {
            try {
              const titleResponse = await anthropic.messages.create({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 30,
                messages: [
                  {
                    role: "user",
                    content: `Summarize this conversation in 3-5 words as a short title (no quotes, no punctuation):\n\nUser: ${message}\nAssistant: ${finalText.substring(0, 200)}`,
                  },
                ],
              });
              const title = (titleResponse.content[0] as Anthropic.TextBlock)?.text?.trim();
              if (title) {
                await admin
                  .from("chat_conversations")
                  .update({ title })
                  .eq("id", convId);
                send({ type: "title", title });
              }
            } catch {
              // Non-critical — skip titling
            }
          }

          break; // Exit loop — we got a final response
        }

        clearInterval(heartbeat);
        send({ type: "done" });
        controller.close();
      } catch (e) {
        clearInterval(heartbeat);
        send({ type: "error", error: String(e) });
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

// GET — list conversations for current user
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createAdminClient();
  const { data: conversations, error } = await admin
    .from("chat_conversations")
    .select("id, title, updated_at")
    .eq("created_by", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ conversations: conversations || [] }), {
    headers: { "Content-Type": "application/json" },
  });
}
