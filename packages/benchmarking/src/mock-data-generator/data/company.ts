// GRagger company data
export const COMPANY = {
  name: "GRagger",
  industry: "Gaming & Interactive Entertainment",
  stage: "Early stage startup",
  mission:
    "Building next-generation multiplayer gaming with AI-powered matchmaking",
};

// Consolidated export for easier imports
export const COMPANY_DATA = {
  name: COMPANY.name,
  githubOrg: "gragger",
  teamMembers: [
    {
      name: "Sarah Chen",
      role: "CEO & Co-founder",
      email: "sarah@gragger.com",
      githubHandle: "sarahchen",
      slackHandle: "sarah",
      category: "leadership",
    },
    {
      name: "Marcus Rodriguez",
      role: "CTO & Co-founder",
      email: "marcus@gragger.com",
      githubHandle: "marcusr",
      slackHandle: "marcus",
      category: "leadership",
    },
    {
      name: "Priya Patel",
      role: "Lead Engineer",
      email: "priya@gragger.com",
      githubHandle: "priyap",
      slackHandle: "priya",
      category: "engineering",
    },
    {
      name: "James Wilson",
      role: "Senior Game Developer",
      email: "james@gragger.com",
      githubHandle: "jameswilson",
      slackHandle: "james",
      category: "engineering",
    },
    {
      name: "Alex Kim",
      role: "Backend Engineer",
      email: "alex@gragger.com",
      githubHandle: "alexkim",
      slackHandle: "alex",
      category: "engineering",
    },
    {
      name: "Jordan Lee",
      role: "DevOps Engineer",
      email: "jordan@gragger.com",
      githubHandle: "jordanlee",
      slackHandle: "jordan",
      category: "engineering",
    },
    {
      name: "Taylor Morgan",
      role: "Junior Engineer",
      email: "taylor@gragger.com",
      githubHandle: "taylormorgan",
      slackHandle: "taylor",
      category: "engineering",
    },
    {
      name: "Emily Thompson",
      role: "Product Designer",
      email: "emily@gragger.com",
      githubHandle: "emilyt",
      slackHandle: "emily",
      category: "product",
    },
    {
      name: "Chris Anderson",
      role: "Product Manager",
      email: "chris@gragger.com",
      githubHandle: "chrisanderson",
      slackHandle: "chris",
      category: "product",
    },
    {
      name: "Maya Patel",
      role: "Community Manager",
      email: "maya@gragger.com",
      githubHandle: "mayapatel",
      slackHandle: "maya",
      category: "community",
    },
  ],
  bots: [
    {
      name: "Dependabot",
      githubHandle: "dependabot[bot]",
      type: "dependency_management",
    },
  ],
  githubRepos: [
    {
      name: "gragger-game",
      description: "Unity game client (C#)",
      language: "C#",
      topics: ["unity", "game-development", "multiplayer"],
    },
    {
      name: "gragger-server",
      description: "Backend services (Node.js/TypeScript)",
      language: "TypeScript",
      topics: ["backend", "nodejs", "api"],
    },
    {
      name: "gragger-matchmaking",
      description: "Matchmaking engine (Go)",
      language: "Go",
      topics: ["matchmaking", "golang", "distributed-systems"],
    },
    {
      name: "gragger-infra",
      description: "Infrastructure as code (Terraform)",
      language: "HCL",
      topics: ["infrastructure", "terraform", "devops"],
    },
    {
      name: "gragger-docs",
      description: "Documentation (Markdown)",
      language: "Markdown",
      topics: ["documentation"],
    },
  ],
  slackChannels: [
    { name: "general", purpose: "Company-wide updates and team coordination" },
    {
      name: "engineering",
      purpose: "Technical discussions, PRs, architecture",
    },
    { name: "product", purpose: "Product planning, design, user feedback" },
    { name: "random", purpose: "Casual chat, off-topic" },
  ],
};

// Keep old exports for backward compatibility
export const TEAM_MEMBERS = COMPANY_DATA.teamMembers;
export const BOTS = COMPANY_DATA.bots;
export const GITHUB_REPOS = COMPANY_DATA.githubRepos;
export const SLACK_CHANNELS = COMPANY_DATA.slackChannels;
