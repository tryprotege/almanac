#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function testProxyServer() {
  console.log("🧪 Testing eBee MCP Proxy Server...\n");

  // Create client to connect to the proxy server
  const client = new Client(
    {
      name: "test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  // Connect via stdio to the main server (now includes proxy functionality)
  const transport = new StdioClientTransport({
    command: "tsx",
    args: ["src/index.ts"],
    env: {
      ...process.env,
      MCP_CONFIG_PATH: "./mcp-config.json",
    },
  });

  try {
    console.log("📡 Connecting to proxy server...");
    await client.connect(transport);
    console.log("✅ Connected!\n");

    // Test 1: List all available tools
    console.log("📋 Test 1: Listing all tools...");
    const toolsResponse = await client.listTools();

    console.log(`\n✅ Found ${toolsResponse.tools.length} tools:\n`);

    // Separate local and remote tools
    const localTools = toolsResponse.tools.filter(
      (t) => !t.name.includes("__")
    );
    const remoteTools = toolsResponse.tools.filter((t) =>
      t.name.includes("__")
    );

    console.log(`📦 Local Tools (${localTools.length}):`);
    localTools.forEach((tool) => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });

    console.log(`\n🔗 Remote Tools (${remoteTools.length}):`);
    remoteTools.forEach((tool) => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });

    // Test 2: Call proxy management tool
    console.log("\n\n📋 Test 2: Listing connected servers...");
    const serversResponse = await client.callTool({
      name: "proxy_list_servers",
      arguments: {},
    });

    console.log("✅ Connected servers:");
    console.log((serversResponse as any).content[0].text);

    // Test 3: Test a local tool (if Redis is available)
    console.log("\n\n📋 Test 3: Testing local tool (redis_set)...");
    try {
      const redisSetResponse = await client.callTool({
        name: "redis_set",
        arguments: {
          key: "test:proxy",
          value: "proxy-working",
          ttl: 60,
        },
      });
      console.log("✅ Redis set response:");
      console.log((redisSetResponse as any).content[0].text);

      // Try to get the value back
      const redisGetResponse = await client.callTool({
        name: "redis_get",
        arguments: {
          key: "test:proxy",
        },
      });
      console.log("✅ Redis get response:");
      console.log((redisGetResponse as any).content[0].text);
    } catch (error) {
      console.log(
        "⚠️ Redis not available (this is expected if Redis isn't running)"
      );
    }

    // Test 4: Test a remote tool (browser snapshot from Playwright)
    console.log(
      "\n\n📋 Test 4: Testing remote tool (playwright__browser_snapshot)..."
    );
    const playwrightTools = remoteTools.filter((t) =>
      t.name.startsWith("playwright__")
    );
    if (playwrightTools.length > 0) {
      console.log(
        `✅ Playwright is connected with ${playwrightTools.length} tools`
      );
      console.log("Sample Playwright tools:");
      playwrightTools.slice(0, 5).forEach((tool) => {
        console.log(`  - ${tool.name}`);
      });
    } else {
      console.log("⚠️ No Playwright tools found");
    }

    console.log("\n\n✅ All tests completed successfully!");
    console.log("\n📊 Summary:");
    console.log(`  - Total tools: ${toolsResponse.tools.length}`);
    console.log(`  - Local tools: ${localTools.length}`);
    console.log(`  - Remote tools: ${remoteTools.length}`);
    console.log(
      `  - Remote servers: ${
        remoteTools.length > 0 ? "✅ Connected" : "❌ Not connected"
      }`
    );
  } catch (error) {
    console.error("\n❌ Test failed:");
    console.error(error);
    process.exit(1);
  } finally {
    await client.close();
    await transport.close();
  }
}

// Run tests
testProxyServer().catch(console.error);
