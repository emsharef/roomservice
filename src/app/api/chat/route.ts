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

When you want to show search results visually as cards (with images, tags, etc.), include <<results>> on its own line in your response. This will render the tool results as a visual card grid. Only use this when the results are directly relevant to what the user asked — don't show cards for intermediate lookups or when you're just gathering context. Place <<results>> where you want the cards to appear in your response.`;

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

              // Send displayable cards to client
              const cards = extractCards(toolCall.name, result as Record<string, unknown>);
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

          // Final text response — stream it
          const finalText = textBlocks.map((b) => b.text).join("\n");

          if (finalText) {
            // Save assistant message
            await admin.from("chat_messages").insert({
              conversation_id: convId,
              role: "assistant",
              content: finalText,
            });

            send({ type: "assistant", content: finalText });
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
