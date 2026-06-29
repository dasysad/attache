#!/usr/bin/env node
/**
 * Attache MCP server — stdio transport for agents (VS-5).
 *
 * Wire in Cursor (~/.cursor/mcp.json):
 *   { "mcpServers": { "attache": { "command": "node", "args": ["<repo>/packages/mcp/dist/main.js"] } } }
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAttacheTools } from "./tools.js";

const server = new McpServer({
  name: "attache",
  version: "0.1.0",
});

registerAttacheTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
