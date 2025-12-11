#!/usr/bin/env node
/**
 * Simple script to query eBee for Phil's top priorities using MCP Client SDK
 *
 * Prerequisites:
 * - eBee server must be running (default: http://localhost:3000)
 *
 * Usage:
 *   pnpm tsx scripts/test-query.ts
 *   PORT=3001 pnpm tsx scripts/test-query.ts  # Custom port
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

interface LightRAGChunk {
  id: string;
  chunk_index?: number;
  document_id: string;
  title: string;
  source: string;
  source_id: string;
  url?: string;
  date?: string;
  snippet: string;
  score: number;
  type?: string;
  people?: string[];
}

interface LightRAGResponse {
  query: string;
  mode: string;
  processing_time_ms: number;
  chunks: LightRAGChunk[];
  stats: {
    total_chunks: number;
    unique_documents: number;
    processing_time_ms: number;
    retrieval_breakdown?: {
      vector_matches: number;
      graph_expanded: number;
      reranked: boolean;
    };
  };
  metadata?: any;
}

async function queryEbee(query: string, port: number = 3000): Promise<void> {
  const url = `http://localhost:${port}/mcp`;

  console.log(`\n🐝 Querying eBee at ${url}`);
  console.log(`📝 Query: "${query}"\n`);

  const client = new Client(
    {
      name: "ebee-query-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  try {
    // Create StreamableHTTP transport for HTTP connection
    const transport = new StreamableHTTPClientTransport(new URL(url));

    // Connect to the MCP server
    await client.connect(transport);
    console.log("✅ Connected to eBee MCP server\n");

    // Call the ebee_search tool
    const result = await client.callTool({
      name: "ebee_search",
      arguments: {
        query: query,
        mode: "mix",
        chunk_top_k: 20,
        enable_rerank: true,
      },
    });

    // Parse the result
    const resultText = result.content[0]?.text;
    if (!resultText) {
      console.error("❌ No content in response");
      return;
    }

    const response: LightRAGResponse = JSON.parse(resultText);

    // Display results
    console.log("✅ Results received!\n");
    console.log("=".repeat(80));
    console.log(`📊 Query Statistics`);
    console.log("=".repeat(80));
    console.log(`Mode: ${response.mode}`);
    console.log(`Processing Time: ${response.processing_time_ms}ms`);
    console.log(`Total Chunks: ${response.stats.total_chunks}`);
    console.log(`Unique Documents: ${response.stats.unique_documents}`);
    if (response.stats.retrieval_breakdown) {
      console.log(
        `Vector Matches: ${response.stats.retrieval_breakdown.vector_matches}`
      );
      console.log(
        `Graph Expanded: ${response.stats.retrieval_breakdown.graph_expanded}`
      );
      console.log(`Reranked: ${response.stats.retrieval_breakdown.reranked}`);
    }
    console.log("");

    // Display chunks
    console.log("=".repeat(80));
    console.log(`📄 Results (${response.chunks.length} chunks)`);
    console.log("=".repeat(80));
    console.log("");

    response.chunks.forEach((chunk, index) => {
      console.log(`${index + 1}. ${chunk.title}`);
      console.log(
        `   Source: ${chunk.source} | Score: ${chunk.score.toFixed(
          3
        )} | Date: ${chunk.date || "N/A"}`
      );
      if (chunk.url) {
        console.log(`   URL: ${chunk.url}`);
      }
      if (chunk.people && chunk.people.length > 0) {
        console.log(`   People: ${chunk.people.join(", ")}`);
      }
      console.log(
        `   Snippet: ${chunk.snippet.substring(0, 200)}${
          chunk.snippet.length > 200 ? "..." : ""
        }`
      );
      console.log("");
    });

    console.log("=".repeat(80));
    console.log("✨ Done!");
  } catch (error) {
    console.error("❌ Error querying eBee:", error);
    if (error instanceof Error) {
      console.error("   Message:", error.message);
      console.error("   Stack:", error.stack);
    }
    process.exit(1);
  } finally {
    // Clean up the connection
    await client.close();
  }
}

// Main
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const QUERY = "what are Phil's top priorities?";

queryEbee(QUERY, PORT)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
