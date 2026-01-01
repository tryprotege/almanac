#!/bin/bash
set -e

# Parse command-line arguments
MCP_SERVERS=""
SKIP_BENCHMARK=false
SKIP_INDEX_VECTOR=false
SKIP_INDEX_GRAPH=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --mcp-servers=*)
      MCP_SERVERS="${1#*=}"
      shift
      ;;
    --skip-benchmark)
      SKIP_BENCHMARK=true
      shift
      ;;
    --skip-index-vector)
      SKIP_INDEX_VECTOR=true
      shift
      ;;
    --skip-index-graph)
      SKIP_INDEX_GRAPH=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--mcp-servers=notion,github] [--skip-benchmark] [--skip-index-vector] [--skip-index-graph]"
      exit 1
      ;;
  esac
done

# Function to check if an MCP server should be enabled
should_enable_server() {
  local server_name=$1
  
  # If no specific servers specified, enable all
  if [ -z "$MCP_SERVERS" ]; then
    return 0
  fi
  
  # Check if server is in the comma-separated list
  if echo "$MCP_SERVERS" | grep -qw "$server_name"; then
    return 0
  fi
  
  return 1
}

# Wipe data
cd packages/server && echo "yes" | npx tsx ./scripts/wipe-data.ts 

# Start dev server
cd ../.. && pnpm dev & sleep 5

# Register MCP servers based on arguments
if should_enable_server "github"; then
  echo "Enabling GitHub MCP server..."
  curl --request POST --url http://localhost:3000/api/mcp-servers --header 'Content-Type: application/json' --data '
  {
    "name": "github",
    "type": "streamable-http",
    "url": "http://localhost:4000/mcp/github"
  }
  '
fi

if should_enable_server "notion"; then
  echo "Enabling Notion MCP server..."
  curl --request POST --url http://localhost:3000/api/mcp-servers --header 'Content-Type: application/json' --data '
  {
    "name": "notion",
    "type": "streamable-http",
    "url": "http://localhost:4000/mcp/notion"
  }
  '
fi

if should_enable_server "fathom"; then
  echo "Enabling Fathom MCP server..."
  curl --request POST --url http://localhost:3000/api/mcp-servers --header 'Content-Type: application/json' --data '
  {
    "name": "fathom",
    "type": "streamable-http",
    "url": "http://localhost:4000/mcp/fathom"
  }
  '
fi

if should_enable_server "slack"; then
  echo "Enabling Slack MCP server..."
  curl --request POST --url http://localhost:3000/api/mcp-servers --header 'Content-Type: application/json' --data '
  {
    "name": "slack",
    "type": "streamable-http",
    "url": "http://localhost:4000/mcp/slack"
  }
  '
fi

# Sync records
npx tsx ./scripts/sync-records.ts

# Index vectors (unless skipped)
if [ "$SKIP_INDEX_VECTOR" = false ]; then
  echo "Indexing vectors..."
  npx tsx ./scripts/index-vectors.ts
else
  echo "Skipping vector indexing..."
fi

# Index graph (unless skipped)
if [ "$SKIP_INDEX_GRAPH" = false ]; then
  echo "Indexing graph..."
  npx tsx ./scripts/index-graph.ts
else
  echo "Skipping graph indexing..."
fi

# Run benchmark tests (unless skipped)
if [ "$SKIP_BENCHMARK" = false ]; then
  echo "Running benchmark tests..."
  cd ../benchmark && pnpm test:matrix
else
  echo "Skipping benchmark tests..."
fi

# TODO: hardcode the ports for now. Find a better way to clean up ports
# clean up ports 
kill -9 `lsof -t -i:4000`
kill -9 `lsof -t -i:5173`
kill -9 `lsof -t -i:3000`