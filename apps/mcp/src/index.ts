import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

/**
 * RFP OS MCP server. Runs as its own process/app (never embedded in the API
 * server), exposing RFP domain capabilities to MCP clients. Domain tools
 * (search knowledge, get RFP status, etc.) are registered here in later
 * phases — this is the scaffold with a single health-check tool.
 */
const server = new McpServer({
  name: "rfp-os",
  version: "0.1.0",
});

server.registerTool(
  "ping",
  {
    title: "Ping",
    description: "Health check for the RFP OS MCP server.",
    inputSchema: {},
  },
  async () => ({
    content: [{ type: "text", text: "pong" }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
