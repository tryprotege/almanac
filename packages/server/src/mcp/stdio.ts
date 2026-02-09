import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '../../.env');

dotenv.config({
  path: envPath,
});

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { initializeServices, mcpServer } from './initialization.js';

const run = async () => {
  // skip mcp proxy
  await initializeServices(true);

  const transport = new StdioServerTransport();

  await mcpServer.connect(transport);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
