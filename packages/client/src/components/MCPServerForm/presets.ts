import { Github, MessageSquare, Video, Settings, FileText } from "lucide-react";

export interface EnvVariable {
  key: string;
  label: string;
  placeholder: string;
  helpText: string;
  type: "text" | "password";
  validation?: RegExp;
  validationMessage?: string;
}

export interface HeaderVariable {
  key: string;
  label: string;
  value: string;
  helpText: string;
  editable?: boolean;
}

export interface ServicePreset {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon: typeof Github;
  type: "stdio" | "sse" | "streamable-http";
  command?: string;
  args?: string[];
  url?: string;
  requiredEnv?: EnvVariable[];
  optionalEnv?: EnvVariable[];
  requiredHeaders?: HeaderVariable[];
  optionalHeaders?: HeaderVariable[];
  documentation: string;
  authGuide: string;
  setupSteps: string[];
  comingSoon?: boolean;
}

export const SERVICE_PRESETS: Record<string, ServicePreset> = {
  slack: {
    id: "slack",
    name: "slack",
    displayName: "Slack",
    description:
      "Connect to your Slack workspace to access channels, messages, and threads",
    icon: MessageSquare,
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    requiredEnv: [
      {
        key: "SLACK_BOT_TOKEN",
        label: "Slack Bot Token",
        placeholder: "xoxb-your-bot-token",
        helpText: "Your Slack Bot User OAuth Token (starts with xoxb-)",
        type: "password",
        validation: /^xoxb-/,
        validationMessage: "Bot token must start with 'xoxb-'",
      },
      {
        key: "SLACK_TEAM_ID",
        label: "Slack Team ID",
        placeholder: "T01234ABCDE",
        helpText: "Your Slack workspace/team ID (starts with T)",
        type: "text",
        validation: /^T[A-Z0-9]+$/,
        validationMessage:
          "Team ID must start with 'T' followed by alphanumeric characters",
      },
    ],
    documentation:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
    authGuide: "https://api.slack.com/apps",
    setupSteps: [
      "Go to https://api.slack.com/apps and create a new app",
      "Navigate to 'OAuth & Permissions' and add required bot token scopes",
      "Install the app to your workspace",
      "Copy the 'Bot User OAuth Token' (starts with xoxb-)",
      "Find your Team ID in your Slack workspace settings",
    ],
  },

  github: {
    id: "github",
    name: "github",
    displayName: "GitHub",
    description: "Access repositories, issues, pull requests, and workflows",
    icon: Github,
    type: "streamable-http",
    url: "https://api.githubcopilot.com/mcp/",
    requiredHeaders: [
      {
        key: "Authorization",
        label: "GitHub Personal Access Token",
        value: "",
        helpText:
          "Your GitHub Personal Access Token (will be prefixed with 'Bearer ')",
        editable: true,
      },
      {
        key: "X-MCP-Toolsets",
        label: "MCP Toolsets",
        value: "all",
        helpText: "Enable all GitHub MCP toolsets (recommended)",
        editable: true,
      },
    ],
    documentation:
      "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
    authGuide: "https://github.com/settings/tokens",
    setupSteps: [
      "Go to GitHub Settings > Developer settings > Personal access tokens",
      "Click 'Generate new token' (classic or fine-grained)",
      "Select required scopes: repo, read:org, read:user, workflow",
      "Generate and copy the token (starts with ghp_ or github_pat_)",
      "Paste the token in the Authorization field below",
    ],
  },

  fathom: {
    id: "fathom",
    name: "fathom",
    displayName: "Fathom",
    description:
      "Access meeting recordings, transcripts, summaries, and action items",
    icon: Video,
    type: "stdio",
    command: "npx",
    args: ["fathom-mcp-server"],
    requiredEnv: [
      {
        key: "FATHOM_API_KEY",
        label: "Fathom API Key",
        placeholder: "your-fathom-api-key",
        helpText: "Your Fathom API key from account settings",
        type: "password",
        validation: /^[a-zA-Z0-9_-]+$/,
        validationMessage:
          "API key should contain only alphanumeric characters, underscores, and hyphens",
      },
    ],
    documentation: "https://fathom.video/api",
    authGuide: "https://app.fathom.video/settings/integrations",
    setupSteps: [
      "Log in to your Fathom account",
      "Navigate to Settings > Integrations",
      "Find the API section and generate a new API key",
      "Copy the API key and paste it below",
      "Keep your API key secure and don't share it",
    ],
  },

  // "google-drive": {
  //   id: "google-drive",
  //   name: "google-drive",
  //   displayName: "Google Drive",
  //   description: "Access files, folders, and documents from Google Drive",
  //   icon: HardDrive,
  //   type: "stdio",
  //   command: "npx",
  //   args: ["-y", "@modelcontextprotocol/server-gdrive"],
  //   requiredEnv: [
  //     {
  //       key: "GOOGLE_CLIENT_ID",
  //       label: "Google Client ID",
  //       placeholder: "your-client-id.apps.googleusercontent.com",
  //       helpText: "OAuth 2.0 Client ID from Google Cloud Console",
  //       type: "text",
  //     },
  //     {
  //       key: "GOOGLE_CLIENT_SECRET",
  //       label: "Google Client Secret",
  //       placeholder: "your-client-secret",
  //       helpText: "OAuth 2.0 Client Secret from Google Cloud Console",
  //       type: "password",
  //     },
  //     {
  //       key: "GOOGLE_REFRESH_TOKEN",
  //       label: "Google Refresh Token",
  //       placeholder: "your-refresh-token",
  //       helpText: "OAuth 2.0 Refresh Token obtained through OAuth flow",
  //       type: "password",
  //     },
  //   ],
  //   documentation: "https://developers.google.com/drive/api",
  //   authGuide: "https://console.cloud.google.com/apis/credentials",
  //   setupSteps: [
  //     "Go to Google Cloud Console and create a new project",
  //     "Enable the Google Drive API for your project",
  //     "Create OAuth 2.0 credentials (Desktop app type)",
  //     "Download the credentials JSON file",
  //     "Use OAuth 2.0 Playground to get a refresh token",
  //     "Enter the Client ID, Client Secret, and Refresh Token below",
  //   ],
  //   comingSoon: true,
  // },

  notion: {
    id: "notion",
    name: "notion",
    displayName: "Notion",
    description:
      "Access pages, databases, and content from your Notion workspace",
    icon: FileText,
    type: "stdio",
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    requiredEnv: [
      {
        key: "OPENAPI_MCP_HEADERS",
        label: "Notion API Headers (JSON)",
        placeholder:
          '{"Authorization": "Bearer ntn_****", "Notion-Version": "2022-06-28"}',
        helpText:
          "JSON object with Authorization (Bearer ntn_****) and Notion-Version (2022-06-28) headers",
        type: "text",
        validation:
          /^\{.*"Authorization".*"Bearer ntn_[a-zA-Z0-9]+".*"Notion-Version".*"2022-06-28".*\}$/,
        validationMessage:
          "Must be valid JSON with Authorization (Bearer ntn_...) and Notion-Version (2022-06-28)",
      },
    ],
    documentation: "https://developers.notion.com/docs/getting-started",
    authGuide: "https://www.notion.so/my-integrations",
    setupSteps: [
      "Go to https://www.notion.so/my-integrations and create a new integration",
      "Give your integration a name and select the workspace",
      "Copy the 'Internal Integration Token' (starts with ntn_)",
      "Share the pages/databases you want to access with your integration",
      'Enter as JSON: {"Authorization": "Bearer ntn_YOUR_TOKEN", "Notion-Version": "2022-06-28"}',
    ],
  },
};

export const CUSTOM_PRESET: ServicePreset = {
  id: "custom",
  name: "custom",
  displayName: "Custom Server",
  description: "Configure a custom MCP server with advanced options",
  icon: Settings,
  type: "stdio",
  command: "",
  args: [],
  requiredEnv: [],
  documentation: "https://modelcontextprotocol.io/docs",
  authGuide: "",
  setupSteps: [
    "Choose the server type (STDIO, SSE, or Streamable HTTP)",
    "Enter the command and arguments for STDIO servers",
    "Or enter the URL for SSE/HTTP servers",
    "Add any required environment variables or headers",
    "Test the connection and save",
  ],
};

export function getPresetById(id: string): ServicePreset | undefined {
  const lowerId = id.toLowerCase();
  // Try exact match first
  if (SERVICE_PRESETS[lowerId]) {
    return SERVICE_PRESETS[lowerId];
  }
  // Check if any preset name matches (case-insensitive)
  const preset = Object.values(SERVICE_PRESETS).find(
    (p) => p.name.toLowerCase() === lowerId || p.id.toLowerCase() === lowerId
  );
  if (preset) return preset;
  if (lowerId === "custom") return CUSTOM_PRESET;
  return undefined;
}

export function getAllPresets(): ServicePreset[] {
  return [...Object.values(SERVICE_PRESETS), CUSTOM_PRESET];
}

export function getAvailablePresets(): ServicePreset[] {
  return Object.values(SERVICE_PRESETS).filter((preset) => !preset.comingSoon);
}
