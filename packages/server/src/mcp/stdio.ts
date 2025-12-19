import "dotenv/config.js";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initializeServices, mcpServer } from "./initialization.js";

const run = async () => {
  // skip mcp proxy
  await initializeServices(true);

  const transport = new StdioServerTransport();

  await mcpServer.connect(transport);
};

run().catch((err) => {
  console.error("sss", err);
  process.exit(1);
});
