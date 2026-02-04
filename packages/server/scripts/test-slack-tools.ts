import { mcpServer } from '../src/mcp/initialization.js';

// List all registered tools
const tools = mcpServer.listTools();

console.log('\n=== Registered MCP Tools ===\n');
console.log(`Total tools: ${tools.length}\n`);

// Filter for Slack tools
const slackTools = tools.filter((tool) => tool.name.startsWith('slack__'));

console.log(`Slack tools: ${slackTools.length}`);
slackTools.forEach((tool) => {
  console.log(`  - ${tool.name}`);
});

console.log('\n');
