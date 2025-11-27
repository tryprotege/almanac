export const mockPersona = {
  persona:
    "I'm a software engineering team lead managing multiple projects. I need to track tasks, features, bugs, and team member assignments. I work primarily with React, TypeScript, and Node.js. My team uses Notion for documentation, Slack for communication, and GitHub for code. I'm interested in understanding relationships between tasks, identifying blockers, and keeping track of who's working on what.",
  updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
};

export const mockModelConfig = {
  llmProvider: "openrouter" as const,
  llmApiKey: "sk-or*********************vMgF",
  llmBaseURL: "https://openrouter.ai/api/v1",
  llmChatModel: "openai/gpt-4o-mini",
  llmEmbeddingModel: "text-embedding-3-small",
  rerankerEnabled: true,
  rerankerApiKey: "xyz*********************abc",
  rerankerBaseURL: "https://api.deepinfra.com/v1/inference",
  rerankerModel: "Qwen/Qwen3-Reranker-8B",
  updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
};
