# Room Service Chat Feature — Design

## Goal

Add a conversational AI interface to Room Service that lets gallery staff query their data in natural language — finding artworks, matching collectors to artists, researching artists, and reasoning across all three entities.

## Architecture

Server-side tool use via a Next.js API route. The client sends messages to `POST /api/chat`, which runs an agentic loop: Claude receives the conversation + tool definitions, decides which tools to call, the server executes them against Supabase, feeds results back to Claude, and streams the final response to the client via SSE. Conversations are persisted to the database.

## Data Model

### chat_conversations

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| title | text | Auto-generated from first exchange via Haiku |
| created_by | uuid FK → user_profiles | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### chat_messages

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| conversation_id | uuid FK → chat_conversations | ON DELETE CASCADE |
| role | text | "user", "assistant", "tool_call", "tool_result" |
| content | text | Message text |
| tool_data | jsonb | For tool calls: { name, input, result } |
| created_at | timestamptz | |

## System Prompt

Lightweight gallery context — no full dataset:
- Gallery name (Make Room Los Angeles), location, program description
- Summary stats: artwork/artist/contact counts
- List of available tools with descriptions
- Response style instructions: concise, gallery-professional, include links using `/inventory/{id}`, `/artists/{id}`, `/contacts/{id}` format

Claude accesses specific data via tools, not pre-loaded context.

## Tools (7)

### search_artworks
Find artworks by filters.
- **Params**: query (text), artist_name, medium, min_price, max_price, status, style_tags, subject_tags, mood_tags, limit
- **Returns**: id, title, artist_names, year, medium, price, status, primary_image_url, ai_description, style/subject/mood tags
- **Implementation**: wraps keyword_search_artworks RPC + filters

### search_contacts
Find contacts/collectors.
- **Params**: query (name/company), type, location, tags, style_preferences, subject_preferences, limit
- **Returns**: id, display_name, company, email, location, type, tags, style/subject/mood preferences, engagement_level, collection_mentions
- **Implementation**: wraps search_contacts RPC + joins contacts_extended

### search_artists
Find artists by criteria.
- **Params**: query (name), country, medium, style_tags, limit
- **Returns**: id, display_name, country, life_dates, bio (truncated), work_count, formatted_bio, market_context, style/subject tags from works
- **Implementation**: wraps search_artists RPC + joins artists_extended

### get_record
Fetch full detail for a specific record.
- **Params**: type ("artwork" | "artist" | "contact"), id
- **Returns**: full record with all enrichment data + related records (artist's works, contact's transactions, etc.)

### find_matches
Cross-entity matching.
- **Params**: source_type ("artist" | "artwork" | "contact"), source_id, target_type, limit
- **Returns**: ranked matches with match reasoning
- **Implementation**: tag overlap + embedding similarity between source and target entities

### find_similar_artworks
Visual/semantic similarity search.
- **Params**: artwork_id, embedding_type ("clip" for visual | "description" for conceptual), status, limit
- **Returns**: ranked artworks with similarity score
- **Implementation**: wraps search_artworks RPC using source artwork's embedding vector

### get_stats
Gallery-wide aggregates.
- **Params**: entity ("artworks" | "artists" | "contacts"), group_by (optional: "status", "medium", "country", "type")
- **Returns**: counts, breakdowns

## API Routes

### POST /api/chat — Send message (streaming)
- **Body**: `{ conversationId?, message }`
- **Creates** new conversation if no conversationId
- **Agentic loop**:
  1. Load conversation history from chat_messages
  2. Build Claude messages array (system prompt + history + new message)
  3. Call Claude (Sonnet) with tools, streaming enabled
  4. On tool calls: stream status event, execute against Supabase, save to DB, feed back to Claude
  5. On final text: stream token-by-token, save assistant message to DB
  6. Send done event with conversationId
- **SSE events**: `{ type: "status", text }`, `{ type: "delta", text }`, `{ type: "done", conversationId }`
- **maxDuration**: 300
- **Heartbeat**: every 10s during tool execution
- **Model**: claude-sonnet-4-6

### GET /api/chat — List conversations
- Returns `{ conversations: [{ id, title, updated_at }] }` ordered by updated_at desc

### GET /api/chat/[id] — Load conversation messages
- Returns `{ conversation, messages }` — only user + assistant role messages exposed; tool_call/tool_result stored for replay but displayed as collapsed status lines

### DELETE /api/chat/[id] — Delete conversation
- Cascading delete of messages

### Auth
All routes: Supabase auth check, staff/admin role required (same as other routes).

## Frontend

### Route: /tools/chat

### Layout
- **Left sidebar** (~280px): conversation list, "New Chat" button, sorted by updated_at desc. Title + relative timestamp per entry.
- **Main area**: message thread + input bar at bottom.

### Message Rendering
- **User**: right-aligned, dark background
- **Assistant**: left-aligned, light background, markdown rendered (lists, bold, links)
- **Record links**: clickable links to `/inventory/{id}`, `/artists/{id}`, `/contacts/{id}`
- **Tool status**: small gray italic text between messages ("Searched 2,236 artworks..."), collapsed by default, expandable

### Input
- Text input + submit button, Cmd+Enter to send
- Disabled during streaming
- Streaming response appears token-by-token with animated cursor

### States
- **Empty** (no conversations): centered prompt with 3-4 clickable example queries
- **Loading**: skeleton sidebar, spinner in chat
- **Streaming**: animated cursor at end of assistant bubble
- **Error**: inline error with retry button

### Components
- `ChatPage` — layout (sidebar + main)
- `ConversationList` — sidebar, fetches via GET /api/chat
- `ChatThread` — message list + input, manages SSE streaming
- `ChatMessage` — single message renderer by role

### Auto-titling
After first assistant response, Haiku call: "Summarize this conversation in 3-5 words." Saves to chat_conversations.title.

## Future Enhancements (not in v1)
- Rich result cards: artwork thumbnails, contact cards, artist profiles inline
- Semantic search over past conversations
- Haiku "quick mode" toggle for faster/cheaper responses
- Collector-facing chat with limited data access
- Token management: summarize old messages for long conversations
