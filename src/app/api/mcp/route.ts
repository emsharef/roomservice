import { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "crypto";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// API key auth
// ---------------------------------------------------------------------------

async function validateApiKey(
  request: NextRequest,
): Promise<{ valid: boolean; error?: string }> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { valid: false, error: "Missing Authorization: Bearer <key>" };
  }

  const rawKey = authHeader.slice(7);
  if (!rawKey.startsWith("rs_live_")) {
    return { valid: false, error: "Invalid key format" };
  }

  const prefix = rawKey.slice(0, 16); // "rs_live_" + 8 chars
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const admin = createAdminClient();
  const { data: keyRow } = await admin
    .from("mcp_api_keys")
    .select("id, key_hash, revoked_at")
    .eq("key_prefix", prefix)
    .single();

  if (!keyRow) {
    return { valid: false, error: "Invalid API key" };
  }

  if (keyRow.key_hash !== keyHash) {
    return { valid: false, error: "Invalid API key" };
  }

  if (keyRow.revoked_at) {
    return { valid: false, error: "API key has been revoked" };
  }

  // Update last_used_at (fire and forget)
  admin
    .from("mcp_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id)
    .then(() => {});

  return { valid: true };
}

// ---------------------------------------------------------------------------
// MCP Streamable HTTP handlers
// ---------------------------------------------------------------------------

async function handleMcpRequest(request: NextRequest): Promise<Response> {
  const auth = await validateApiKey(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Create fresh server + transport per request (stateless)
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });

  await server.connect(transport);

  // Let the transport handle the request and produce a response
  const response = await transport.handleRequest(request);

  return response;
}

export async function POST(request: NextRequest) {
  return handleMcpRequest(request);
}

export async function GET(request: NextRequest) {
  return handleMcpRequest(request);
}

export async function DELETE(request: NextRequest) {
  return handleMcpRequest(request);
}
