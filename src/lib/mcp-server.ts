import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CHAT_TOOLS, executeTool } from "@/lib/chat-tools";

/**
 * Creates a configured MCP server with all Room Service tools registered.
 * Each request should create a fresh server instance (stateless mode).
 */
export function createMcpServer() {
  const server = new Server(
    { name: "room-service", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  // List all available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: CHAT_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.input_schema,
    })),
  }));

  // Execute a tool call
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const { result } = await executeTool(name, args ?? {});
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${String(err)}` }],
        isError: true,
      };
    }
  });

  return server;
}
