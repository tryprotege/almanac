import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initializeServices } from "./initialization.js";

const run = async () => {
  // skip mcp proxy
  await initializeServices(true);

  const transport = new StdioServerTransport();

  const { mcpServer } = await import("./initialization.js");

  await mcpServer.connect(transport);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
