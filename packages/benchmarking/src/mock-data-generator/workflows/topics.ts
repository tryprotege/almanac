import type { WorkflowTopic } from './types.js';
import type { GeneratorConfig } from '../types.js';
import { generateWithLLM } from '../utils/llm.js';
import { COMPANY_DATA } from '../data/company.js';
import { selectRandomMultiple } from '../utils/random.js';

/**
 * Generate workflow topics that will be used across all services
 * These create coherent narratives that span GitHub, Slack, Notion, and Fathom
 */
export async function generateWorkflowTopics(
  count: number,
  config: GeneratorConfig,
): Promise<WorkflowTopic[]> {
  const prompt = `Generate ${count} realistic software development topics for a gaming startup (${COMPANY_DATA.name}).

Each topic should be specific enough to discuss across GitHub, Slack, Notion, and meetings.

Return JSON array with objects containing:
{
  "title": "Brief title (e.g., 'Player matchmaking latency spike')",
  "description": "2-3 sentence description of the issue/feature",
  "category": "bug" | "feature" | "infrastructure" | "design" | "process",
  "technicalDetails": "Specific technical context (APIs, services, error messages)",
  "affectedRepo": "gragger-game" | "gragger-server" | "gragger-matchmaking" | "gragger-infra" | "gragger-docs"
}

Make topics realistic for a multiplayer gaming company:
- Performance issues in matchmaking
- UI/UX improvements for player lobbies
- Backend scaling challenges
- Game balance discussions
- Infrastructure cost optimization
- New feature rollouts
- Security concerns
- Analytics pipeline issues

Return ONLY the JSON array:`;

  try {
    const response = await generateWithLLM(prompt, config);
    const topics = JSON.parse(response);

    // Assign random participants to each topic
    return topics.map((topic: any, idx: number) => ({
      ...topic,
      id: `topic-${idx + 1}`,
      participants: selectRandomMultiple(
        COMPANY_DATA.teamMembers.map((m) => m.name),
        Math.floor(Math.random() * 4) + 2, // 2-5 participants
      ),
    }));
  } catch (error) {
    console.error('Error generating workflow topics:', error);
    // Fallback topics
    return generateFallbackTopics(count);
  }
}

/**
 * Fallback topics if LLM generation fails
 */
function generateFallbackTopics(count: number): WorkflowTopic[] {
  const fallbackTopics: Omit<WorkflowTopic, 'id' | 'participants'>[] = [
    {
      title: 'Matchmaking service high latency',
      description:
        'Players experiencing 5-10 second delays in ranked matchmaking queue. Issue appears to affect primarily EU servers during peak hours.',
      category: 'bug',
      technicalDetails:
        'Redis connection pool exhaustion, timeout errors in matchmaking-service logs',
      affectedRepo: 'gragger-matchmaking',
    },
    {
      title: 'Add spectator mode to game client',
      description:
        'Players requesting ability to spectate ongoing matches. Would enhance engagement and help with tournament streaming.',
      category: 'feature',
      technicalDetails:
        'Requires Unity client changes, backend API for match streaming, WebRTC integration',
      affectedRepo: 'gragger-game',
    },
    {
      title: 'Database connection pool optimization',
      description:
        'Backend services experiencing intermittent database timeouts under load. Need to optimize connection pooling strategy.',
      category: 'infrastructure',
      technicalDetails: 'PostgreSQL connection limits, node-postgres pool configuration',
      affectedRepo: 'gragger-server',
    },
    {
      title: 'Player lobby UI redesign',
      description:
        'Current lobby interface is confusing for new players. Need cleaner design with better UX flow.',
      category: 'design',
      technicalDetails: 'Unity UI prefabs, lobby state management, animations',
      affectedRepo: 'gragger-game',
    },
    {
      title: 'Implement automated deployment pipeline',
      description:
        'Manual deployments are error-prone and slow. Need CI/CD pipeline with automated testing and rollback capability.',
      category: 'process',
      technicalDetails: 'GitHub Actions, Terraform, Docker, k8s deployments',
      affectedRepo: 'gragger-infra',
    },
    {
      title: 'Memory leak in game server',
      description:
        'Game servers show increasing memory usage over time, eventually crashing after ~24 hours of uptime.',
      category: 'bug',
      technicalDetails: 'Node.js heap profiling, possible WebSocket connection cleanup issue',
      affectedRepo: 'gragger-server',
    },
    {
      title: 'Add player progression system',
      description:
        'Implement XP, levels, and unlockable content to improve player retention and engagement.',
      category: 'feature',
      technicalDetails: 'Database schema for player stats, achievement system, API endpoints',
      affectedRepo: 'gragger-server',
    },
    {
      title: 'Upgrade to latest Unity LTS version',
      description:
        'Current Unity version is deprecated. Need to upgrade to latest LTS for security patches and performance improvements.',
      category: 'infrastructure',
      technicalDetails: 'Unity 2021.3 LTS to 2022.3 LTS, potential breaking changes in physics',
      affectedRepo: 'gragger-game',
    },
  ];

  const topics: WorkflowTopic[] = [];
  for (let i = 0; i < count; i++) {
    const fallbackTopic = fallbackTopics[i % fallbackTopics.length];
    topics.push({
      ...fallbackTopic,
      id: `topic-${i + 1}`,
      participants: selectRandomMultiple(
        COMPANY_DATA.teamMembers.map((m) => m.name),
        Math.floor(Math.random() * 4) + 2,
      ),
    });
  }

  return topics;
}
