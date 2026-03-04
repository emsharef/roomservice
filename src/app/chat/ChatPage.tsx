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

interface Message {
  id?: string;
  role: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  tool_data?: { name: string; input: unknown; result: unknown } | null;
  created_at?: string;
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

function renderMarkdown(text: string) {
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
  // Regex: markdown links [text](url) or **bold** or `code`
  const regex = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
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
        isInternal ? (
          <Link
            key={match.index}
            href={href}
            className="text-blue-600 underline hover:text-blue-800"
          >
            {match[1]}
          </Link>
        ) : (
          <a
            key={match.index}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline hover:text-blue-800"
          >
            {match[1]}
          </a>
        ),
      );
    } else if (match[3]) {
      // Bold
      parts.push(<strong key={match.index}>{match[3]}</strong>);
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, statusText]);

  // Focus input when conversation changes
  useEffect(() => {
    inputRef.current?.focus();
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
        // Only show user + assistant messages, filter out tool_call/tool_result
        const visible = (data.messages || []).filter(
          (m: Message) => m.role === "user" || m.role === "assistant",
        );
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
      setStreaming(true);
      setStatusText(null);
      setToolStatuses([]);

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
                  setStatusText(null);
                  break;

                case "assistant":
                  setMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: data.content },
                  ]);
                  setStatusText(null);
                  break;

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
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
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
                  className="ml-2 hidden rounded p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 group-hover:block"
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
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
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-gray-900 text-white"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content}
                  </div>
                </div>
              ))}

              {/* Tool status indicators */}
              {toolStatuses.length > 0 && (
                <div className="flex justify-start">
                  <div className="text-xs italic text-gray-400">
                    {toolStatuses.map((s, i) => (
                      <p key={i}>{s}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Streaming status */}
              {streaming && statusText && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 text-xs italic text-gray-400">
                    <Spinner className="h-3 w-3" />
                    {statusText}
                  </div>
                </div>
              )}

              {/* Streaming indicator (no specific status) */}
              {streaming && !statusText && messages[messages.length - 1]?.role === "user" && (
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
              className="flex-1 resize-none rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none disabled:opacity-50"
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
