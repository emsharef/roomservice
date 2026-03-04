"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Conversation {
  id: string;
  title: string | null;
  updated_at: string;
}

interface ResultCard {
  type: "artwork" | "contact" | "artist" | "prospect";
  id: string | number;
  title: string;
  subtitle?: string;
  image?: string;
  price?: number;
  status?: string;
  email?: string;
  tags?: string[];
  engagement?: string;
  location?: string;
  workCount?: number;
  link: string;
}

interface Message {
  id?: string;
  role: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  tool_data?: { name: string; input: unknown; result: unknown } | null;
  cardMap?: Map<string, ResultCard>;
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Client-side card extraction (mirrors server extractCards for loaded convos)
// ---------------------------------------------------------------------------

function extractCardsClient(toolName: string, result: any): ResultCard[] | null {
  if (!result) return null;

  if (toolName === "search_artworks" || toolName === "find_similar_artworks") {
    const artworks = result.artworks || result.similar_artworks;
    if (!artworks?.length) return null;
    return artworks.map((a: any) => ({
      type: "artwork" as const, id: a.id,
      title: a.display_title || a.title || "Untitled",
      subtitle: [a.medium, a.year].filter(Boolean).join(", "),
      image: a.primary_image_url, price: a.price, status: a.status, link: a.link,
    }));
  }

  if (toolName === "find_matches") {
    const matches = result.matches;
    if (!matches?.length) return null;
    if (matches[0].primary_image_url || matches[0].medium) {
      return matches.map((a: any) => ({
        type: "artwork" as const, id: a.id,
        title: a.display_title || a.title || "Untitled",
        subtitle: [a.medium, a.year].filter(Boolean).join(", "),
        image: a.primary_image_url, price: a.price, status: a.status, link: a.link,
      }));
    }
    return matches.map((c: any) => ({
      type: "contact" as const, id: c.id, title: c.display_name,
      subtitle: [c.company, c.location].filter(Boolean).join(" · "),
      tags: c.matching_tags?.style || c.style_preferences || [], link: c.link,
    }));
  }

  if (toolName === "search_contacts") {
    const contacts = result.contacts;
    if (!contacts?.length) return null;
    return contacts.map((c: any) => ({
      type: "contact" as const, id: c.id, title: c.display_name,
      subtitle: [c.company, c.location].filter(Boolean).join(" · "),
      email: c.email, tags: c.style_preferences || [],
      engagement: c.engagement_level, link: c.link,
    }));
  }

  if (toolName === "search_artists") {
    const artists = result.artists;
    if (!artists?.length) return null;
    return artists.map((a: any) => ({
      type: "artist" as const, id: a.id, title: a.display_name,
      subtitle: [a.country, a.life_dates].filter(Boolean).join(" · "),
      workCount: a.work_count, link: a.link,
    }));
  }

  if (toolName === "search_prospects") {
    const prospects = result.prospects;
    if (!prospects?.length) return null;
    return prospects.map((p: any) => ({
      type: "prospect" as const, id: p.id, title: p.display_name,
      subtitle: [p.title, p.company].filter(Boolean).join(", "),
      location: p.location, tags: p.style_preferences || [],
      engagement: p.engagement_level, link: p.link,
    }));
  }

  if (toolName === "get_prospect") {
    if (result.error || !result.link) return null;
    return [{
      type: "prospect" as const, id: result.id, title: result.display_name || result.input_name,
      subtitle: [result.title, result.company].filter(Boolean).join(", "),
      location: result.location, tags: result.style_preferences || [],
      engagement: result.engagement_level, link: result.link,
    }];
  }

  if (toolName === "get_record") {
    if (result.error || !result.link) return null;
    if (result.link?.startsWith("/inventory/")) {
      return [{
        type: "artwork" as const, id: result.id,
        title: result.display_title || result.title || "Untitled",
        subtitle: [result.medium, result.year].filter(Boolean).join(", "),
        image: result.primary_image_url, price: result.price, status: result.status, link: result.link,
      }];
    }
    if (result.link?.startsWith("/contacts/")) {
      return [{
        type: "contact" as const, id: result.id, title: result.display_name,
        subtitle: [result.company, result.location].filter(Boolean).join(" · "),
        email: result.email, link: result.link,
      }];
    }
    if (result.link?.startsWith("/artists/")) {
      return [{
        type: "artist" as const, id: result.id, title: result.display_name,
        subtitle: [result.country, result.life_dates].filter(Boolean).join(" · "),
        link: result.link,
      }];
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Example queries
// ---------------------------------------------------------------------------

const EXAMPLES = [
  "Which available artworks would work for a show about nature and landscape?",
  "Find collectors who are interested in abstract art",
  "Tell me about the artists we represent from Mexico",
  "What's our price range for available works?",
];

// ---------------------------------------------------------------------------
// Markdown-lite renderer (bold, links, lists)
// ---------------------------------------------------------------------------

function parseTableRow(line: string): string[] {
  return line.split("|").slice(1, -1).map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\|[\s:-]+(\|[\s:-]+)+\|?\s*$/.test(line);
}

function renderMarkdown(text: string) {
  // Safety net: strip any remaining <<card:...>> markers
  text = text.replace(/<<card:\/[^>]+>>/g, "");
  // Split into lines for list handling
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="ml-4 list-disc space-y-1">
          {listItems.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      listItems = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect markdown tables: header row | separator row | data rows
    if (
      line.trim().startsWith("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      flushList();
      const headers = parseTableRow(line);
      i++; // skip separator
      const rows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith("|")) {
        i++;
        rows.push(parseTableRow(lines[i]));
      }
      elements.push(
        <div key={`table-${i}`} className="my-2 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-gray-300">
                {headers.map((h, hi) => (
                  <th key={hi} className="px-2 py-1.5 text-left font-semibold text-gray-700">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-gray-100">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1 text-gray-600">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.+)/);
    const numListMatch = line.match(/^\d+\.\s+(.+)/);

    if (listMatch) {
      listItems.push(listMatch[1]);
    } else if (numListMatch) {
      listItems.push(numListMatch[1]);
    } else {
      flushList();
      if (line.trim() === "") {
        elements.push(<br key={`br-${i}`} />);
      } else if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
        elements.push(<hr key={`hr-${i}`} className="my-2 border-gray-200" />);
      } else if (line.startsWith("### ")) {
        elements.push(
          <h4 key={`h-${i}`} className="mt-2 mb-1 font-semibold">
            {renderInline(line.slice(4))}
          </h4>,
        );
      } else if (line.startsWith("## ")) {
        elements.push(
          <h3 key={`h-${i}`} className="mt-3 mb-1 text-base font-semibold">
            {renderInline(line.slice(3))}
          </h3>,
        );
      } else {
        elements.push(
          <p key={`p-${i}`}>{renderInline(line)}</p>,
        );
      }
    }
  }
  flushList();

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  // Handle bold, links, and inline code
  const parts: React.ReactNode[] = [];
  // Regex: markdown links [text](url) or **bold content** or `code`
  // Links must come before bold in alternation so [link](url) inside **bold** gets caught
  const regex = /\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|`([^`]+)`/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1] && match[2]) {
      // Link
      const href = match[2];
      const isInternal = href.startsWith("/");
      parts.push(
        <a
          key={match.index}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline hover:text-blue-800"
        >
          {match[1]}
        </a>,
      );
    } else if (match[3]) {
      // Bold — recursively render inline content (handles links inside bold)
      parts.push(<strong key={match.index}>{renderInline(match[3])}</strong>);
    } else if (match[4]) {
      // Code
      parts.push(
        <code key={match.index} className="rounded bg-gray-100 px-1 py-0.5 text-sm">
          {match[4]}
        </code>,
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// ---------------------------------------------------------------------------
// Strip trailing incomplete <<card: marker during streaming
// ---------------------------------------------------------------------------

function stripTrailingPartialMarker(text: string): string {
  const lastOpen = text.lastIndexOf("<<card:");
  if (lastOpen === -1) return text;
  const closeAfter = text.indexOf(">>", lastOpen);
  if (closeAfter === -1) return text.slice(0, lastOpen);
  return text;
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Result cards
// ---------------------------------------------------------------------------

function ResultCards({ cards }: { cards: ResultCard[] }) {
  const [expanded, setExpanded] = useState(false);
  const preview = cards.slice(0, 4);
  const shown = expanded ? cards : preview;
  const hasMore = cards.length > 4;

  return (
    <div className="mt-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {shown.map((card, i) => (
          <a
            key={`${card.id}-${i}`}
            href={card.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group block overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md"
          >
            {card.type === "artwork" && (
              <div className="aspect-square overflow-hidden bg-gray-100">
                {card.image ? (
                  <img
                    src={card.image}
                    alt={card.title}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-gray-400">No image</div>
                )}
              </div>
            )}
            <div className="p-2">
              <p className="truncate text-xs font-medium text-gray-900">{card.title}</p>
              {card.subtitle && (
                <p className="truncate text-xs text-gray-500">{card.subtitle}</p>
              )}
              {card.price != null && (
                <p className="mt-0.5 text-xs font-medium text-gray-700">
                  ${card.price.toLocaleString()}
                </p>
              )}
              {card.status && card.type === "artwork" && (
                <span className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  card.status === "available" ? "bg-green-50 text-green-700" :
                  card.status === "sold" ? "bg-red-50 text-red-600" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {card.status}
                </span>
              )}
              {card.email && (
                <p className="truncate text-xs text-gray-500">{card.email}</p>
              )}
              {card.location && card.type === "prospect" && (
                <p className="truncate text-xs text-gray-500">{card.location}</p>
              )}
              {card.engagement && (
                <span className="mt-0.5 inline-block rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                  {card.engagement.replace(/_/g, " ")}
                </span>
              )}
              {card.tags && card.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-0.5">
                  {card.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="rounded bg-sky-50 px-1 py-0.5 text-[10px] text-sky-700">
                      {tag}
                    </span>
                  ))}
                  {card.tags.length > 3 && (
                    <span className="text-[10px] text-gray-400">+{card.tags.length - 3}</span>
                  )}
                </div>
              )}
              {card.workCount != null && (
                <p className="mt-0.5 text-xs text-gray-500">{card.workCount} works</p>
              )}
            </div>
          </a>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 text-xs text-gray-500 hover:text-gray-700"
        >
          {expanded ? "Show less" : `Show all ${cards.length} results`}
        </button>
      )}
    </div>
  );
}

function AssistantMessage({ content, cardMap }: { content: string; cardMap?: Map<string, ResultCard> }) {
  // Split content into segments: text and <<card:/path>> markers
  const cardPattern = /<<card:(\/[^>]+)>>/g;

  if (!cardMap || cardMap.size === 0 || !cardPattern.test(content)) {
    // No cards — render as plain assistant bubble, strip any stray markers
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl bg-gray-100 px-4 py-3 text-sm leading-relaxed text-gray-800">
          {renderMarkdown(content.replace(/<<card:\/[^>]+>>/g, ""))}
        </div>
      </div>
    );
  }

  // Split on card markers, collecting both text and card paths
  const segments: Array<{ type: "text"; value: string } | { type: "cards"; cards: ResultCard[] }> = [];
  let lastIndex = 0;
  let match;
  let pendingCards: ResultCard[] = [];
  cardPattern.lastIndex = 0;

  while ((match = cardPattern.exec(content)) !== null) {
    // Text before this marker
    const textBefore = content.slice(lastIndex, match.index);
    if (textBefore.trim()) {
      // Flush any pending cards before text
      if (pendingCards.length > 0) {
        segments.push({ type: "cards", cards: [...pendingCards] });
        pendingCards = [];
      }
      segments.push({ type: "text", value: textBefore });
    }

    // Look up card by link path — exact match, then fragment-stripped match
    const path = match[1];
    let card = cardMap.get(path);
    if (!card) {
      // Try stripping fragment (for prospect links like /tools/prospects/BATCH#p-UUID)
      const pathBase = path.split("#")[0];
      for (const [key, c] of cardMap) {
        if (key.split("#")[0] === pathBase) {
          card = c;
          break;
        }
      }
    }
    // Deduplicate — don't add same card twice
    if (card && !pendingCards.some((pc) => pc.link === card!.link)) {
      pendingCards.push(card);
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  const remaining = content.slice(lastIndex);
  if (pendingCards.length > 0) {
    segments.push({ type: "cards", cards: [...pendingCards] });
  }
  if (remaining.trim()) {
    segments.push({ type: "text", value: remaining });
  }

  return (
    <div className="space-y-2">
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <div key={i} className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl bg-gray-100 px-4 py-3 text-sm leading-relaxed text-gray-800">
              {renderMarkdown(seg.value)}
            </div>
          </div>
        ) : (
          <ResultCards key={i} cards={seg.cards} />
        ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ChatPage() {
  // Conversation list
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [toolStatuses, setToolStatuses] = useState<string[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const pendingCardsRef = useRef<Map<string, ResultCard>>(new Map());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  // Scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, statusText, streamingContent]);

  // Focus input when starting a new chat (not when loading saved ones)
  useEffect(() => {
    if (!activeConvId) inputRef.current?.focus();
  }, [activeConvId]);

  async function fetchConversations() {
    setLoadingConvs(true);
    try {
      const res = await fetch("/api/chat");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch {
      // ignore
    }
    setLoadingConvs(false);
  }

  async function loadConversation(convId: string) {
    setActiveConvId(convId);
    setMessages([]);
    setToolStatuses([]);

    try {
      const res = await fetch(`/api/chat/${convId}`);
      if (res.ok) {
        const data = await res.json();
        const allMessages = data.messages || [];

        // Build card maps from tool_call messages for each subsequent assistant message
        const cardMaps: Map<string, ResultCard>[] = [];
        let currentCards = new Map<string, ResultCard>();

        for (const m of allMessages) {
          if (m.role === "tool_call" && m.tool_data) {
            const td = m.tool_data;
            const cards = extractCardsClient(td.name, td.result);
            if (cards) {
              for (const card of cards) {
                if (card.link) currentCards.set(card.link, card);
              }
            }
          } else if (m.role === "assistant") {
            cardMaps.push(currentCards.size > 0 ? new Map(currentCards) : new Map());
            currentCards = new Map();
          }
        }

        // Only show user + assistant messages with reconstructed cardMaps
        let assistantIdx = 0;
        const visible: Message[] = [];
        for (const m of allMessages) {
          if (m.role === "user") {
            visible.push(m);
          } else if (m.role === "assistant") {
            const cm = cardMaps[assistantIdx];
            visible.push({ ...m, cardMap: cm && cm.size > 0 ? cm : undefined });
            assistantIdx++;
          }
        }
        setMessages(visible);
      }
    } catch {
      // ignore
    }
  }

  function startNewChat() {
    setActiveConvId(null);
    setMessages([]);
    setToolStatuses([]);
    setInput("");
    setSidebarOpen(false);
    inputRef.current?.focus();
  }

  async function deleteConversation(convId: string) {
    if (!confirm("Delete this conversation?")) return;
    await fetch(`/api/chat/${convId}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (activeConvId === convId) {
      startNewChat();
    }
  }

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;

      const userMessage: Message = { role: "user", content: text.trim() };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      inputRef.current?.blur();
      setStreaming(true);
      setStatusText(null);
      setToolStatuses([]);
      setStreamingContent("");
      pendingCardsRef.current = new Map();

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: activeConvId, message: text.trim() }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case "conversation_id":
                  setActiveConvId(data.conversationId);
                  break;

                case "status":
                  setStatusText(data.text);
                  break;

                case "tool_result":
                  setToolStatuses((prev) => [...prev, data.summary]);
                  if (data.cards && Array.isArray(data.cards)) {
                    for (const card of data.cards) {
                      if (card.link) pendingCardsRef.current.set(card.link, card);
                    }
                  }
                  setStatusText(null);
                  break;

                case "delta":
                  // Progressive text chunk — append to streaming content
                  setStreamingContent((prev) => prev + data.text);
                  setStatusText(null);
                  setToolStatuses([]);
                  break;

                case "assistant": {
                  // Complete message with cards — replaces streaming bubble
                  const cardMap = new Map<string, ResultCard>(pendingCardsRef.current);
                  if (data.cards && Array.isArray(data.cards)) {
                    for (const card of data.cards) {
                      if (card.link) cardMap.set(card.link, card);
                    }
                  }
                  setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: data.content, cardMap: cardMap.size > 0 ? cardMap : undefined },
                  ]);
                  setStreamingContent("");
                  pendingCardsRef.current = new Map();
                  setStatusText(null);
                  break;
                }

                case "title":
                  // Update conversation title in sidebar
                  setConversations((prev) =>
                    prev.map((c) =>
                      c.id === activeConvId || !activeConvId
                        ? { ...c, title: data.title }
                        : c,
                    ),
                  );
                  break;

                case "error":
                  setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: `Error: ${data.error}` },
                  ]);
                  break;

                case "done":
                  break;
              }
            } catch {
              // skip malformed lines
            }
          }
        }

        // Refresh conversations list (new conversation may have been created)
        fetchConversations();
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${String(e)}` },
        ]);
      }

      setStreaming(false);
      setStatusText(null);
    },
    [activeConvId, streaming],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  // ------ Render ------

  return (
    <div className="fixed inset-0 top-16 flex overflow-hidden">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 top-16 z-30 flex w-72 flex-col border-r border-gray-200 bg-gray-50 transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-700">Conversations</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={startNewChat}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800"
            >
              New Chat
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded p-1 text-gray-400 hover:text-gray-600 md:hidden"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-5 w-5 text-gray-400" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">No conversations yet</p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-gray-100 ${
                  activeConvId === conv.id ? "bg-white shadow-sm" : ""
                }`}
                onClick={() => {
                  loadConversation(conv.id);
                  setSidebarOpen(false);
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {conv.title || "Untitled"}
                  </p>
                  <p className="text-xs text-gray-400">{relativeTime(conv.updated_at)}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                  className="ml-2 rounded p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 md:hidden md:group-hover:block"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header with sidebar toggle */}
        <div className="flex items-center border-b border-gray-200 px-4 py-2 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
            </svg>
          </button>
          <span className="ml-2 text-sm font-medium text-gray-700">
            {activeConvId ? conversations.find((c) => c.id === activeConvId)?.title || "Chat" : "New Chat"}
          </span>
        </div>

        {messages.length === 0 && !activeConvId ? (
          /* Empty state */
          <div className="flex flex-1 flex-col items-center justify-center px-4 sm:px-8">
            <h1 className="mb-2 text-2xl font-bold text-gray-900">Room Service Chat</h1>
            <p className="mb-8 text-sm text-gray-500">
              Ask questions about artworks, artists, and collectors in your gallery.
            </p>
            <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
              {EXAMPLES.map((example, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(example);
                    sendMessage(example);
                  }}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages */
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((msg, i) => {
                if (msg.role === "user") {
                  return (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl bg-gray-900 px-4 py-3 text-sm leading-relaxed text-white">
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={i}>
                    <AssistantMessage content={msg.content} cardMap={msg.cardMap} />
                  </div>
                );
              })}

              {/* Streaming assistant response — renders inline cards as markers complete */}
              {streaming && streamingContent && (
                <div>
                  <AssistantMessage
                    content={stripTrailingPartialMarker(streamingContent)}
                    cardMap={pendingCardsRef.current.size > 0 ? pendingCardsRef.current : undefined}
                  />
                </div>
              )}

              {/* Tool status indicators */}
              {toolStatuses.length > 0 && !streamingContent && (
                <div className="flex justify-start">
                  <div className="text-xs italic text-gray-400">
                    {toolStatuses.map((s, i) => (
                      <p key={i}>{s}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Streaming status */}
              {streaming && statusText && !streamingContent && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 text-xs italic text-gray-400">
                    <Spinner className="h-3 w-3" />
                    {statusText}
                  </div>
                </div>
              )}

              {/* Thinking indicator — only before any content arrives */}
              {streaming && !statusText && !streamingContent && toolStatuses.length === 0 && messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-400">
                    <Spinner className="h-3.5 w-3.5" />
                    Thinking...
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Input bar */}
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-end gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about artworks, artists, or collectors..."
              rows={1}
              disabled={streaming}
              className="flex-1 resize-none rounded-lg border border-gray-300 px-4 py-2.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none disabled:opacity-50 sm:text-sm"
              style={{ maxHeight: "120px" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || streaming}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white transition-colors hover:bg-gray-800 disabled:opacity-30"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
          <p className="mx-auto mt-1.5 max-w-3xl text-xs text-gray-400">
            Cmd+Enter to send
          </p>
        </div>
      </div>
    </div>
  );
}
