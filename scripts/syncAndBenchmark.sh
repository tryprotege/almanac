#!/bin/bash
set -e

# Cleanup function to kill processes on ports
cleanup() {
  echo "Cleaning up ports..."
  kill -9 `lsof -t -i:4000` 2>/dev/null || true
  kill -9 `lsof -t -i:5173` 2>/dev/null || true
  kill -9 `lsof -t -i:3000` 2>/dev/null || true
  echo "Cleanup complete."
}

# Set trap to run cleanup on script exit (normal or interrupted)
trap cleanup EXIT INT TERM

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
  # Read GitHub indexingConfig from config file
  GITHUB_CONFIG=$(jq '.indexingConfig' ../data-sources-config/github.json)

  echo "Enabling GitHub MCP server..."
  curl --request POST --url http://localhost:3000/api/data-sources --header 'Content-Type: application/json' --data '
  {
    "name": "github",
    "type": "streamable-http",
    "url": "http://localhost:4000/mcp/github"
  }
  '

  curl --request POST --url http://localhost:3000/api/indexing-config/save --header 'Content-Type: application/json' --data "
  {
    \"config\": ${GITHUB_CONFIG},
    \"status\": \"active\",
    \"startingPointValues\": {
      \"query\": [
        \"user:any\"
      ]
    }
  }
  "
fi

if should_enable_server "notion"; then
  # Read Notion indexingConfig from config file
  NOTION_CONFIG=$(jq '.indexingConfig' ../data-sources-config/notion.json)

  echo "Enabling Notion MCP server..."
  curl --request POST --url http://localhost:3000/api/data-sources --header 'Content-Type: application/json' --data '
  {
    "name": "notion",
    "type": "streamable-http",
    "url": "http://localhost:4000/mcp/notion"
  }
  '

  curl --request POST --url http://localhost:3000/api/indexing-config/save --header 'Content-Type: application/json' --data "
  {
    \"config\": ${NOTION_CONFIG},
    \"status\": \"active\",
    \"startingPointValues\": {
      \"teamWorkspaceId\": [
        \"TODO:\"
      ]
    }
  }
  "
fi

if should_enable_server "fathom"; then
  # Read Notion indexingConfig from config file
  FATHOM_CONFIG=$(jq '.indexingConfig' ../data-sources-config/fathom.json)

  echo "Enabling Fathom MCP server..."
  curl --request POST --url http://localhost:3000/api/data-sources --header 'Content-Type: application/json' --data '
  {
    "name": "fathom",
    "type": "streamable-http",
    "url": "http://localhost:4000/mcp/fathom"
  }
  '

  curl --request POST --url http://localhost:3000/api/indexing-config/save --header 'Content-Type: application/json' --data "
  {
    \"config\": ${FATHOM_CONFIG},
    \"status\": \"active\"
  }
  "
fi

if should_enable_server "slack"; then
    # Read Slack indexingConfig from config file
  SLACK_CONFIG=$(jq '.indexingConfig' ../data-sources-config/slack.json)

  echo "Enabling Slack MCP server..."
  curl --request POST --url http://localhost:3000/api/data-sources --header 'Content-Type: application/json' --data '
  {
    "name": "slack",
    "type": "streamable-http",
    "url": "http://localhost:4000/mcp/slack"
  }
  '

  curl --request POST --url http://localhost:3000/api/indexing-config/save --header 'Content-Type: application/json' --data "
  {
    \"config\": ${SLACK_CONFIG},
    \"status\": \"active\",
    \"startingPointValues\": {
      \"channelTypes\": [\"public_channel,private_channel\"],
      \"messageHistoryLimit\": [\"100d\"]
    }
  }
  "
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

# # Run benchmark tests (unless skipped)
if [ "$SKIP_BENCHMARK" = false ]; then
  echo "Running benchmark tests..."
  cd ../benchmark && pnpm test:matrix
else
  echo "Skipping benchmark tests..."
fi

# Cleanup will be handled by the trap on EXIT
