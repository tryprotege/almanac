import type { NotionPage, NotionUser } from '@ebee-oss/shared-util';
import type { GeneratorConfig, RelationshipContext } from '../types.js';
import { COMPANY_DATA } from '../data/company.js';
import { generateWithLLM } from '../utils/llm.js';
import { selectRandom } from '../utils/random.js';
import { generateRandomDate } from '../utils/dates.js';
import { generateRandomStringId } from '../utils/id-generator.js';

/**
 * Generate Notion pages (functional approach - no classes)
 */

// Page types for work vs personal categorization
const WORK_PAGE_TYPES = [
  'Technical Specification',
  'Architecture Document',
  'Meeting Notes',
  'Project Plan',
  'Sprint Planning',
  'API Documentation',
  'Design System',
  'Onboarding Guide',
  'Incident Report',
  'Feature Requirements',
];

const PERSONAL_PAGE_TYPES = [
  'Personal Notes',
  'Learning Resources',
  'Book Notes',
  'Career Goals',
  'Project Ideas',
  'Reading List',
  'Weekly Reflection',
  'Travel Plans',
];

export async function generateNotionPages(
  count: number,
  dates: Date[],
  config: GeneratorConfig,
  context?: RelationshipContext,
): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  const users = generateNotionUsers();

  const workCount = Math.floor(count * 0.7); // 70% work
  const personalCount = count - workCount; // 30% personal

  console.log(`Generating ${count} Notion pages (${workCount} work, ${personalCount} personal)...`);
  if (context) {
    console.log(
      `  With context: ${context.issues?.length || 0} issues, ${
        context.meetings?.length || 0
      } meetings`,
    );
  }

  // Generate work pages
  for (let i = 0; i < workCount; i++) {
    const pageType = selectRandom(WORK_PAGE_TYPES);
    const author = selectRandom(users);
    const createdTime = generateRandomDate(dates[0], dates[dates.length - 1]);
    const lastEditedTime = new Date(
      createdTime.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000,
    );

    let prompt = `Generate a realistic Notion page for ${COMPANY_DATA.name} (Gaming & Interactive Entertainment startup).

Page Type: ${pageType}
Author: ${author.name}
Category: Work Document
`;

    // Add context-based references if available
    if (context) {
      // 60% chance to reference a GitHub issue
      if (context.issues && context.issues.length > 0 && Math.random() < 0.6) {
        const issue = selectRandom(context.issues);
        prompt += `\nThis document relates to GitHub Issue #${issue.number}: ${issue.title}
Include a reference to this issue in the content.
`;
      }
      // 40% chance to reference a meeting
      else if (context.meetings && context.meetings.length > 0 && Math.random() < 0.4) {
        const meeting = selectRandom(context.meetings);
        prompt += `\nThis document summarizes the meeting: ${meeting.title}
Include meeting details and key takeaways in the content.
`;
      }
    }

    prompt += `\nGenerate a professional work document with:
1. A clear, descriptive title (max 80 chars)
2. Detailed content relevant to a gaming startup (2-4 paragraphs)

Return ONLY a JSON object with this exact structure (no markdown, no extra text):
{
  "title": "Document title here",
  "content": "Full document content here with multiple paragraphs separated by \\n\\n"
}
  `;

    try {
      const response = await generateWithLLM(prompt, config);
      const parsed = JSON.parse(response);

      pages.push({
        object: 'page',
        id: generateRandomStringId('notion-page', 12),
        created_time: createdTime.toISOString(),
        last_edited_time: lastEditedTime.toISOString(),
        created_by: {
          object: 'user',
          id: author.id,
        },
        last_edited_by: {
          object: 'user',
          id: author.id,
        },
        cover: undefined,
        icon: undefined,
        parent: {
          type: 'workspace',
          workspace: true,
        },
        archived: false,
        properties: {
          title: {
            id: 'title',
            type: 'title',
            title: [
              {
                type: 'text',
                text: {
                  content: parsed.title,
                  link: null,
                },
                annotations: {
                  bold: false,
                  italic: false,
                  strikethrough: false,
                  underline: false,
                  code: false,
                  color: 'default',
                },
                plain_text: parsed.title,
                href: null,
              },
            ],
          },
        },
        url: `https://notion.so/${generateRandomStringId('page', 32)}`,
        public_url: undefined,
      });

      if ((i + 1) % 10 === 0) {
        console.log(`  Generated ${i + 1}/${workCount} work pages`);
      }
    } catch (error) {
      console.error(`Error generating work page ${i + 1}:`, error);
    }
  }

  // Generate personal pages
  for (let i = 0; i < personalCount; i++) {
    const pageType = selectRandom(PERSONAL_PAGE_TYPES);
    const author = selectRandom(users);
    const createdTime = generateRandomDate(dates[0], dates[dates.length - 1]);
    const lastEditedTime = new Date(
      createdTime.getTime() + Math.random() * 14 * 24 * 60 * 60 * 1000,
    );

    const prompt = `Generate a realistic personal Notion page for ${author.name}.

Page Type: ${pageType}
Category: Personal Note

Generate a personal document with:
1. A casual, personal title (max 80 chars)
2. Personal content (1-3 paragraphs)

Return ONLY a JSON object with this exact structure (no markdown, no extra text):
{
  "title": "Personal note title here",
  "content": "Personal content here with paragraphs separated by \\n\\n"
}`;

    try {
      const response = await generateWithLLM(prompt, config);
      const parsed = JSON.parse(response);

      pages.push({
        object: 'page',
        id: generateRandomStringId('notion-page', 12),
        created_time: createdTime.toISOString(),
        last_edited_time: lastEditedTime.toISOString(),
        created_by: {
          object: 'user',
          id: author.id,
        },
        last_edited_by: {
          object: 'user',
          id: author.id,
        },
        cover: undefined,
        icon: undefined,
        parent: {
          type: 'workspace',
          workspace: true,
        },
        archived: false,
        properties: {
          title: {
            id: 'title',
            type: 'title',
            title: [
              {
                type: 'text',
                text: {
                  content: parsed.title,
                  link: null,
                },
                annotations: {
                  bold: false,
                  italic: false,
                  strikethrough: false,
                  underline: false,
                  code: false,
                  color: 'default',
                },
                plain_text: parsed.title,
                href: null,
              },
            ],
          },
        },
        url: `https://notion.so/${generateRandomStringId('page', 32)}`,
        public_url: undefined,
      });

      if ((workCount + i + 1) % 10 === 0) {
        console.log(`  Generated ${workCount + i + 1}/${count} total pages`);
      }
    } catch (error) {
      console.error(`Error generating personal page ${i + 1}:`, error);
    }
  }

  return pages;
}

export function generateNotionUsers(): NotionUser[] {
  return COMPANY_DATA.teamMembers.map((member, index) => ({
    object: 'user',
    id: generateRandomStringId('notion-user', 10),
    type: 'person',
    name: member.name,
    avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.name}`,
    person: {
      email: member.email,
    },
  }));
}

export function generateNotionDatabases(count: number = 5): any[] {
  const databases = [];
  const databaseNames = [
    'Project Tracker',
    'Sprint Planning',
    'Bug Reports',
    'Feature Requests',
    'Team Directory',
  ];

  for (let i = 0; i < Math.min(count, databaseNames.length); i++) {
    databases.push({
      object: 'database',
      id: generateRandomStringId('notion-db', 10),
      created_time: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
      last_edited_time: new Date().toISOString(),
      title: [
        {
          type: 'text',
          text: {
            content: databaseNames[i],
            link: null,
          },
          plain_text: databaseNames[i],
        },
      ],
      description: [],
      icon: undefined,
      cover: undefined,
      properties: {},
      parent: {
        type: 'workspace',
        workspace: true,
      },
      url: `https://notion.so/db-${i + 1}`,
      archived: false,
    });
  }

  return databases;
}

export function generateNotionBlocks(pages: any[]): Map<string, any[]> {
  const blocksMap = new Map<string, any[]>();

  // Generate blocks from the actual generated content
  for (const page of pages) {
    // Extract the content that was generated for this page
    const pageContent = (page as any)._content || 'Default content for this page.';
    const paragraphs = pageContent.split('\n\n').filter((p: string) => p.trim());

    const blocks = paragraphs.map((para: string, idx: number) => ({
      object: 'block',
      id: generateRandomStringId('block', 12),
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: para,
              link: null,
            },
            plain_text: para,
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: 'default',
            },
            href: null,
          },
        ],
        color: 'default',
      },
      created_time: page.created_time,
      last_edited_time: page.last_edited_time,
      has_children: false,
      archived: false,
    }));

    blocksMap.set(page.id, blocks);
  }

  return blocksMap;
}
