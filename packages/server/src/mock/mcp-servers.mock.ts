export const mockMCPServers = [
  {
    name: "notion",
    type: "stdio" as const,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-notion"],
    env: {
      NOTION_API_KEY: "secret_xxx*********************yyy",
    },
    isDisabled: false,
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
  },
  {
    name: "slack",
    type: "stdio" as const,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: {
      SLACK_BOT_TOKEN: "xoxb-*********************",
      SLACK_TEAM_ID: "T01234567",
    },
    isDisabled: false,
    createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: "github",
    type: "stdio" as const,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: {
      GITHUB_TOKEN: "ghp_*********************",
    },
    isDisabled: true,
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const mockMCPServerStatus = (name: string) => ({
  name,
  connected: name !== "github", // GitHub is disabled, so not connected
});
