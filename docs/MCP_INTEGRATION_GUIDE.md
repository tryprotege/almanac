# MCP Integration Guide - Connecting Data Sources to eBee

This guide provides step-by-step instructions for connecting MCP (Model Context Protocol) servers to eBee, enabling data synchronization from Fathom, Notion, Slack, and GitHub.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Understanding MCP Servers](#understanding-mcp-servers)
- [Fathom Integration](#fathom-integration)
- [Notion Integration](#notion-integration)
- [Slack Integration](#slack-integration)
- [GitHub Integration](#github-integration)
- [Verifying Your Connection](#verifying-your-connection)
- [Troubleshooting](#troubleshooting)

## 🔧 Prerequisites

Before connecting MCP servers, ensure you have:

1. **eBee Running**: The eBee server should be running locally or deployed

   ```bash
   # Start eBee with Docker
   pnpm docker:infra
   pnpm dev:server

   # Or start everything
   pnpm docker:all
   ```

2. **Node.js**: Version 24.0.0 or higher

   ```bash
   node --version
   # Should output: v24.x.x or higher
   ```

3. **API Access**: You'll need API keys/tokens from each service

4. **Verify eBee is Running**:
   ```bash
   curl http://localhost:3000/health
   # Should return: {"status":"healthy"}
   ```

## 🌐 Understanding MCP Servers

MCP (Model Context Protocol) servers provide standardized interfaces for eBee to connect to various data sources. eBee supports two types:

### 1. Stdio-based Servers (Local)

- Runs on your machine via `npx` or `node`
- Communicates via standard input/output
- Used by: Fathom, Notion, Slack

### 2. Streamable HTTP Servers (Remote)

- Runs on a remote server
- Communicates via HTTP streaming
- Used by: GitHub Copilot MCP

---

## 🎙️ Fathom Integration

### What You'll Get

- ✅ Meeting recordings and transcripts
- ✅ AI-generated summaries
- ✅ Action items and highlights
- ✅ Meeting participants and teams

### Step 1: Get Your Fathom API Key

1. Log in to [Fathom](https://fathom.video)
2. Navigate to **Settings** → **Integrations** → **API**
3. Click **"Generate API Key"**
4. Copy the API key (keep it secure!)

### Step 2: Add Fathom to eBee

Replace `<path_to>` with your actual path to the ebee-oss directory:

```bash
curl -X POST http://localhost:3000/api/mcp-servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "fathom",
    "type": "stdio",
    "command": "npx",
    "args": ["fathom-mcp-server"],
    "env": {
      "FATHOM_API_KEY": "<your_fathom_api_key>"
    }
  }'
```

**Example with actual path**:

```bash
curl -X POST http://localhost:3000/api/mcp-servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "fathom",
    "type": "stdio",
    "command": "npx",
    "args": ["fathom-mcp-server"],
    "env": {
      "FATHOM_API_KEY": "fathom_abc123xyz"
    }
  }'
```

### Step 3: Verify Connection

```bash
# Check if Fathom server was added
curl http://localhost:3000/api/mcp-servers

# Trigger initial sync
curl -X POST http://localhost:3000/api/sync/fathom
```

**Expected Response**: Server configuration with status "connected"

---

## 📝 Notion Integration

### What You'll Get

- ✅ Pages and sub-pages
- ✅ Databases and their entries
- ✅ Page content (text, headings, lists)
- ✅ Properties and metadata

### Step 1: Create Notion Integration

1. Go to [Notion Integrations](https://www.notion.so/my-integrations)
2. Click **"+ New integration"**
3. Fill in the details:
   - **Name**: eBee Integration
   - **Associated workspace**: Select your workspace
   - **Type**: Internal integration
4. Click **"Submit"**
5. Copy the **Internal Integration Token** (starts with `ntn_`)

### Step 2: Share Pages with Integration

**Important**: The integration can only access pages you explicitly share with it.

1. Open any Notion page you want to sync
2. Click **"Share"** in the top right
3. Click **"Invite"**
4. Search for your integration name (e.g., "eBee Integration")
5. Click **"Invite"**
6. Repeat for all pages/databases you want to sync

### Step 3: Add Notion to eBee

Replace `<token>` with your Notion integration token:

```bash
curl -X POST http://localhost:3000/api/mcp-servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "notion",
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@notionhq/notion-mcp-server"],
    "env": {
      "OPENAPI_MCP_HEADERS": "{\"Authorization\": \"Bearer ntn_<token>\", \"Notion-Version\": \"2022-06-28\"}"
    }
  }'
```

**Example with actual token**:

```bash
curl -X POST http://localhost:3000/api/mcp-servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "notion",
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@notionhq/notion-mcp-server"],
    "env": {
      "OPENAPI_MCP_HEADERS": "{\"Authorization\": \"Bearer ntn_abc123xyz456\", \"Notion-Version\": \"2022-06-28\"}"
    }
  }'
```

### Step 4: Verify Connection

```bash
# Check if Notion server was added
curl http://localhost:3000/api/mcp-servers

# Trigger initial sync
curl -X POST http://localhost:3000/api/sync/notion
```

---

## 💬 Slack Integration

### What You'll Get

- ✅ Public channels and messages
- ✅ Private channels (if bot is invited)
- ✅ Direct messages
- ✅ Thread replies
- ✅ User profiles

### Step 1: Create Slack App

1. Go to [Slack API Dashboard](https://api.slack.com/apps)
2. Click **"Create New App"** → **"From scratch"**
3. Fill in the details:
   - **App Name**: eBee Integration
   - **Workspace**: Select your workspace
4. Click **"Create App"**

### Step 2: Configure Bot Permissions

1. In the left sidebar, click **"OAuth & Permissions"**
2. Scroll to **"Scopes"** → **"Bot Token Scopes"**
3. Click **"Add an OAuth Scope"** and add these scopes:
   ```
   channels:history
   channels:read
   groups:history
   groups:read
   im:history
   im:read
   mpim:history
   mpim:read
   users:read
   users:read.email
   ```

### Step 3: Install App to Workspace

1. Scroll to the top of the **"OAuth & Permissions"** page
2. Click **"Install to Workspace"**
3. Review permissions and click **"Allow"**
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### Step 4: Get Your Team ID

1. In Slack, click your workspace name in the top left
2. Select **"Settings & administration"** → **"Workspace settings"**
3. Your Team ID is shown in the URL or on the page
   - Format: `T06CYGJA5HV`

### Step 5: Add Slack to eBee

Replace `<bot_token>` and `<team_id>` with your actual values:

```bash
curl -X POST http://localhost:3000/api/mcp-servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "slack",
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-slack"],
    "env": {
      "SLACK_BOT_TOKEN": "xoxb-<bot_token>",
      "SLACK_TEAM_ID": "<team_id>"
    }
  }'
```

**Example with actual values**:

```bash
curl -X POST http://localhost:3000/api/mcp-servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "slack",
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-slack"],
    "env": {
      "SLACK_BOT_TOKEN": "xoxb-1234567890-1234567890123-abcdefghijklmnopqrstuvwx",
      "SLACK_TEAM_ID": "T06CYGJA5HV"
    }
  }'
```

### Step 6: Invite Bot to Channels

The bot can only read channels it's invited to:

1. Open any Slack channel
2. Type `/invite @eBee Integration`
3. Press Enter
4. Repeat for all channels you want to sync

### Step 7: Verify Connection

```bash
# Check if Slack server was added
curl http://localhost:3000/api/mcp-servers

# Trigger initial sync
curl -X POST http://localhost:3000/api/sync/slack
```

---

## 🐙 GitHub Integration

### What You'll Get

- ✅ Repository information
- ✅ Issues and comments
- ✅ Pull requests and reviews
- ✅ Commits and branches
- ✅ README and documentation

### Step 1: Get GitHub Copilot Access

**Important**: This integration uses GitHub Copilot's MCP endpoint, which requires:

- GitHub Copilot subscription (Individual, Business, or Enterprise)
- Access to GitHub Copilot API

If you don't have Copilot, you can use the standard GitHub MCP server instead (see Alternative Method below).

### Step 2: Generate Personal Access Token

1. Go to [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Fill in the details:
   - **Note**: eBee Integration
   - **Expiration**: Choose your preference
4. Select scopes:
   ```
   ✓ repo (Full control of private repositories)
   ✓ read:org (Read org and team membership)
   ✓ read:user (Read user profile data)
   ```
5. Click **"Generate token"**
6. Copy the token (starts with `ghp_`) - **you won't see it again!**

### Step 3: Add GitHub to eBee

Replace `<personal_token>` with your GitHub personal access token:

```bash
curl -X POST http://localhost:3000/api/mcp-servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "github",
    "type": "streamable-http",
    "isDisabled": false,
    "url": "https://api.githubcopilot.com/mcp/",
    "headers": {
      "Authorization": "Bearer <personal_token>",
      "X-MCP-Toolsets": "all"
    }
  }'
```

**Example with actual token**:

```bash
curl -X POST http://localhost:3000/api/mcp-servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "github",
    "type": "streamable-http",
    "isDisabled": false,
    "url": "https://api.githubcopilot.com/mcp/",
    "headers": {
      "Authorization": "Bearer ghp_abc123xyz456def789ghi012jkl345mno",
      "X-MCP-Toolsets": "all"
    }
  }'
```

### Step 4: Verify Connection

```bash
# Check if GitHub server was added
curl http://localhost:3000/api/mcp-servers

# Trigger initial sync
curl -X POST http://localhost:3000/api/sync/github
```

### Alternative Method: Standard GitHub MCP Server

If you don't have GitHub Copilot, use the standard MCP server:

```bash
curl -X POST http://localhost:3000/api/mcp-servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "github",
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_<your_token>"
    }
  }'
```

---

## ✅ Verifying Your Connection

### 1. List All Connected Servers

```bash
curl http://localhost:3000/api/mcp-servers
```

**Expected Response**:

```json
[
  {
    "name": "fathom",
    "type": "stdio",
    "status": "connected"
  },
  {
    "name": "notion",
    "type": "stdio",
    "status": "connected"
  },
  {
    "name": "slack",
    "type": "stdio",
    "status": "connected"
  },
  {
    "name": "github",
    "type": "streamable-http",
    "status": "connected"
  }
]
```

### 2. Check Sync Status

```bash
# View overall stats
curl http://localhost:3000/api/stats

# Check records from specific source
curl "http://localhost:3000/api/records?source=slack&limit=5"
```

### 3. Test Search Across All Sources

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "project updates",
    "mode": "mix",
    "chunk_top_k": 10
  }'
```

### 4. View in eBee UI

1. Open [http://localhost:5173](http://localhost:5173)
2. Navigate to **Connections** page
3. Verify all servers show as "Connected"
4. Check **Dashboard** for synced data statistics

---

## 🔍 Troubleshooting

### Common Issues

#### 1. "Connection refused" or "ECONNREFUSED"

**Problem**: eBee server is not running

**Solution**:

```bash
# Check if server is running
curl http://localhost:3000/health

# If not running, start it
pnpm dev:server

# Or with Docker
pnpm docker:all
```

#### 2. "Authentication failed" or "Invalid token"

**Problem**: API key/token is incorrect or expired

**Solution**:

- Verify you copied the complete token (no spaces)
- Check token hasn't expired
- Regenerate token if needed
- Test token directly with the service's API

**For Slack**:

```bash
curl -H "Authorization: Bearer xoxb-your-token" \
  https://slack.com/api/auth.test
```

**For GitHub**:

```bash
curl -H "Authorization: Bearer ghp_your-token" \
  https://api.github.com/user
```

**For Notion**:

```bash
curl -H "Authorization: Bearer ntn_your-token" \
  -H "Notion-Version: 2022-06-28" \
  https://api.notion.com/v1/users/me
```

#### 3. "No data synced" or "Empty results"

**Problem**: Permissions not granted or bot not invited

**Solution**:

**For Slack**:

- Invite bot to channels: `/invite @YourBot`
- Verify bot has correct scopes in Slack app settings

**For Notion**:

- Share pages with integration
- Check integration has access to workspace

**For GitHub**:

- Verify token has `repo` scope
- Check you have access to the repositories

#### 4. "Command not found: npx"

**Problem**: Node.js not installed or outdated

**Solution**:

```bash
# Check Node.js version
node --version

# If < v24, install latest from https://nodejs.org
# Or use nvm:
nvm install 24
nvm use 24
```

#### 5. Fathom MCP Server: "Cannot find module"

**Problem**: Fathom MCP server not built

**Solution**:

```bash
cd packages/fathom-mcp-server
pnpm install
pnpm build
ls dist/index.js  # Verify build succeeded
```

#### 6. "Rate limit exceeded"

**Problem**: Too many API requests

**Solution**:

- Wait for rate limit to reset (usually 1 hour)
- Reduce sync frequency in settings
- Upgrade API plan if available

### Debug Mode

Enable detailed logging for troubleshooting:

```bash
# In packages/server/.env
LOG_LEVEL=debug

# Restart server
pnpm dev:server
```

View logs:

```bash
# If using Docker
docker logs ebee_server -f

# If running locally
# Logs appear in terminal
```

### Getting Help

If you're still having issues:

1. **Check the logs**: Look for error messages in server logs
2. **Search issues**: [GitHub Issues](https://github.com/your-repo/issues)
3. **Ask the community**: [Discord Server](https://discord.gg/your-invite)
4. **Create an issue**: Include:
   - MCP server name
   - Error message
   - Steps to reproduce
   - Relevant log output

---

## 📚 Next Steps

After connecting your MCP servers:

1. **Explore the Dashboard**: View synced data statistics
2. **Try Searching**: Test different search modes
3. **Visualize the Graph**: See entity relationships
4. **Configure Personas**: Set up AI personas for different use cases
5. **Monitor Sync**: Check sync status regularly

## 🔗 Related Documentation

- [Architecture Guide](./ARCHITECTURE.md) - System design details
- [API Reference](./API_REFERENCE.md) - Complete API documentation
- [Configuration Guide](./CONFIGURATION.md) - Environment variables
- [Deployment Guide](./DEPLOYMENT.md) - Production setup

## 📖 API Reference Links

- **Fathom API**: [https://developers.fathom.ai](https://developers.fathom.ai)
- **Notion API**: [https://developers.notion.com](https://developers.notion.com)
- **Slack API**: [https://api.slack.com](https://api.slack.com)
- **GitHub API**: [https://docs.github.com/en/rest](https://docs.github.com/en/rest)
- **MCP Protocol**: [https://modelcontextprotocol.io](https://modelcontextprotocol.io)

---

**Last Updated**: 2025-12-08
**Version**: 1.0
**Need Help?** Open an issue or join our Discord community
