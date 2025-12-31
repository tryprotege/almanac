export interface ConfigPromptInput {
  serverName: string;
  displayName: string;
  tools: Array<{
    name: string;
    description?: string;
    inputSchema: any;
  }>;
  samples: Record<string, any>;
  classifications?: Record<string, any>; // Optional tool classifications
  userGuidance?: string; // Optional user-provided guidance
}

/**
 * Generate prompt for LLM to create an IndexingConfig
 */
export function generateConfigPrompt(input: ConfigPromptInput): string {
  const { serverName, displayName, tools, samples, userGuidance } = input;

  // Build user guidance section if provided
  const guidanceSection = userGuidance
    ? `
## ⚠️ USER-PROVIDED GUIDANCE (CRITICAL - FOLLOW THESE INSTRUCTIONS)

The user has provided specific guidance for generating this configuration. Please carefully follow these instructions and incorporate them into the generated config:

---
${userGuidance}
---

Make sure to incorporate these requirements into the generated config.

`
    : "";

  return `# Generate IndexingConfig for "${displayName}"

You are an expert at creating IndexingConfig files for MCP servers. Your task is to generate a valid IndexingConfig in JSON format that will enable automated data indexing from the "${displayName}" MCP server.
${guidanceSection}
## Important: Read-Only Indexing

The tools listed below have been pre-filtered to include ONLY READ operations.
- Write operations (create, update, delete) are automatically passed through to the upstream MCP server
- Search tools are skipped unless explicitly needed for pagination
- You should only use these READ tools for creating fetchers and enrichments

## Available Tools (Read-Only)

${tools
  .map(
    (tool) => `### ${tool.name}
${tool.description || "No description"}

**Input Schema:**
\`\`\`json
${JSON.stringify(tool.inputSchema, null, 2)}
\`\`\`

**Sample Response:**
\`\`\`json
${JSON.stringify(samples[tool.name], null, 2)}
\`\`\``
  )
  .join("\n\n")}

## Target Schema

Map the data to these unified fields:

- **title** (required): Short, human-readable title
- **content** (required): Main text content (use format processors for rich content)
- **people** (optional): Names or IDs of people involved
- **primaryDate** (optional): Main timestamp (created, published, etc.)
- **tags** (optional): Categories, labels, or tags
- **parentId** (optional): Reference to parent record

## Entity Extraction (Graph RAG)

Analyze the sample data for embedded objects that should become graph entities. Common patterns:

1. **Status Objects**: \`{ id, name, color }\` - workflow states (e.g., Backlog, In Progress, Done)
2. **User References**: \`{ id, name, email }\` - people involved (assignees, creators, etc.)
3. **Team/Group Objects**: \`{ id, name }\` - organizational units
4. **Labels/Tags**: \`{ id, name, color }\` - shared classifications across records
5. **Projects/Containers**: \`{ id, name }\` - parent groupings for records

For each entity found, add to the \`entities\` array:

\`\`\`json
"entities": [
  {
    "name": "status",
    "type": "Status",
    "idPath": "$.status.id",
    "titlePath": "$.status.name",
    "condition": "record.status && record.status.id",
    "properties": {
      "color": "$.status.color"
    }
  },
  {
    "name": "assignee",
    "type": "User",
    "idPath": "$.assignee.id",
    "titlePath": "$.assignee.name",
    "condition": "record.assignee && record.assignee.id"
  }
]
\`\`\`

## Relationship Extraction (Graph Edges)

Define relationships between the document and extracted entities:

\`\`\`json
"relationships": [
  {
    "name": "issue_status",
    "type": "HAS_STATUS",
    "targetType": "Status",
    "targetIdPath": "$.status.id",
    "condition": "record.status && record.status.id"
  },
  {
    "name": "issue_assignee",
    "type": "ASSIGNED_TO",
    "targetType": "User",
    "targetIdPath": "$.assignee.id",
    "condition": "record.assignee && record.assignee.id"
  },
  {
    "name": "issue_project",
    "type": "BELONGS_TO",
    "targetType": "Project",
    "targetIdPath": "$.project.id",
    "condition": "record.project && record.project.id"
  }
]
\`\`\`

## Format Processors

Use these built-in processors for rich content (all support options for customization):

- **rich-text-to-markdown**: Convert rich text arrays to Markdown
  - Default: Works with Notion-style rich text (text.content, plain_text, annotations)
  - Options: textPath, plainTextPath, hrefPath, annotationsPath
  - Use for: Notion properties, custom rich text APIs

- **blocks-to-markdown**: Convert block arrays to Markdown documents
  - Default: Works with Notion blocks (type, rich_text field)
  - Options: typePath, contentPath, richTextField, maxDepth, blockTypeMap
  - Use for: Notion pages, custom block-based content

- **markup-to-markdown**: Convert custom markup to standard Markdown
  - Default: Converts Slack mrkdwn syntax
  - Options: rules (regex patterns), userMap, channelMap
  - Use for: Slack messages, Discord, custom markup formats

- **transcript-to-markdown**: Format transcript segments with speakers and timestamps
  - Default: Works with Fathom transcripts (speaker, text, start_time)
  - Options: speakerPath, textPath, timestampPath, timeFormat
  - Use for: Fathom, Zoom, custom meeting transcripts

- **html-to-markdown**: Convert HTML to Markdown (no options)

- **extract-text**: Extract plain text from any format (no options)

## Field Mapping Types

**⚠️ CRITICAL: Records are Individual Objects, NOT Arrays!**

When you receive a record from a fetcher, it is passed as an INDIVIDUAL OBJECT:
- ✅ **Correct:** \`$.name\` - extracts from the individual record
- ✅ **Correct:** \`$.assignee.email\` - nested field access  
- ✅ **Correct:** \`$.labels[*].name\` - array inside the record
- ❌ **WRONG:** \`$[0].name\` - assumes record is an array (IT'S NOT!)
- ❌ **WRONG:** \`$[0].assignee.email\` - DO NOT use array index on root

1. **path**: Simple JSONPath extraction
   \`\`\`json
   {
     "title": {
       "type": "path",
       "path": "$.properties.Name.title[0].text.content"
     }
   }
   \`\`\`

2. **paths**: Combine multiple paths
   \`\`\`json
   {
     "tags": {
       "type": "paths",
       "paths": [
         "$.properties.Tags.multi_select[*].name",
         "$.properties.Status.status.name"
       ]
     }
   }
   \`\`\`

3. **template**: String template
   \`\`\`json
   {
     "title": {
       "type": "template",
       "template": "\${record.name} - \${record.id}"
     }
   }
   \`\`\`

4. **processor**: Use format processor
   \`\`\`json
   {
     "content": {
       "type": "processor",
       "processor": "notion-blocks",
       "input": "$.blocks"
     }
   }
   \`\`\`

5. **code**: TypeScript code for complex transformations
   \`\`\`json
   {
     "content": {
       "type": "code",
       "code": "// Access: record, enrichments\\nreturn enrichments.blocks\\n  .map(b => b.text)\\n  .join('\\\\n');"
     }
   }
   \`\`\`

## Enrichments

Define additional fetches per record:

\`\`\`json
{
  "enrichments": [
    {
      "name": "blocks",
      "tool": "get_page_blocks",
      "paramMapping": {
        "page_id": "$.id"
      },
      "resultPath": "$.results"
    }
  ]
}
\`\`\`

## Dynamic Parameters with forEach

**Use forEach when a tool requires parameters that come from a previous fetcher's results.**

When a tool needs data from earlier in the sync pipeline (e.g., team names from list_teams), use the forEach config to iterate over source records and call the tool once per item.

**Example: Fetching status per team**

If \`list_issue_statuses\` requires a team name parameter, and teams come from \`list_teams\`:

\`\`\`json
{
  "fetchers": {
    "list_teams": {
      "tool": "list_teams",
      "resultPath": "$.content[0].text"
    },
    "list_issue_statuses": {
      "tool": "list_issue_statuses",
      "forEach": {
        "source": "list_teams",
        "path": "$[*]",
        "paramMapping": {
          "team": "$.name"
        },
        "concurrency": 3,
        "continueOnError": true,
        "retries": 2
      },
      "resultPath": "$.content[0].text"
    }
  }
}
\`\`\`

**forEach Config Fields:**
- \`source\`: Name of fetcher that runs earlier (per syncOrder)
- \`path\`: JSONPath to iterate over source records (usually "$[*]" for all)
- \`paramMapping\`: Map source record fields to tool params using JSONPath
- \`concurrency\`: Max parallel calls (default: 3)
- \`continueOnError\`: Continue with partial results on errors (default: true)
- \`retries\`: Retry count per failed call (default: 2)

**Multi-level chaining example:**

For deep hierarchies like teams → projects → issues:

\`\`\`json
{
  "syncOrder": ["list_teams", "list_team_projects", "list_project_issues"],
  "fetchers": {
    "list_teams": {
      "tool": "list_teams",
      "resultPath": "$.content[0].text"
    },
    "list_team_projects": {
      "tool": "list_projects",
      "forEach": {
        "source": "list_teams",
        "path": "$[*]",
        "paramMapping": {
          "teamId": "$.id"
        }
      },
      "resultPath": "$.content[0].text"
    },
    "list_project_issues": {
      "tool": "list_issues",
      "forEach": {
        "source": "list_team_projects",
        "path": "$[*]",
        "paramMapping": {
          "projectId": "$.id"
        }
      },
      "resultPath": "$.content[0].text"
    }
  }
}
\`\`\`

**When to use forEach:**
- Tool requires params that vary per entity (team, project, workspace, etc.)
- Can't pass all values at once (API requires one call per entity)
- Source data comes from an earlier fetcher in syncOrder

**When NOT to use forEach:**
- Tool accepts array/batch parameters
- Tool doesn't require dynamic params
- Data is static/hardcoded

## Instructions

1. **Analyze the tools** and sample data to understand the data structure
2. **Create fetchers** for each tool that retrieves records
3. **Define record types** with detection logic
4. **Map fields** to the target schema using appropriate mapping types
5. **Add enrichments** if additional data is needed per record
6. **Use format processors** for rich content (Notion blocks, Slack messages, etc.)

## Sync Order (Critical for Data Dependencies)

Analyze the data relationships and define a \`syncOrder\` array that specifies the order in which fetchers should execute. This is critical to avoid dependency errors.

**Ordering Principles:**
1. **Reference/lookup data first**: Users, Teams, Statuses, Labels, Priorities (entities that other records reference)
2. **Parent containers second**: Projects, Workspaces, Repositories, Folders (grouping structures)
3. **Main content last**: Issues, Tasks, Documents, Comments (records that depend on the above)

**Example:**
- ✅ Correct: ["list_users", "list_teams", "list_statuses", "list_projects", "list_issues"]
- ❌ Wrong: ["list_issues", "list_projects", "list_users"] (issues need users/projects to exist first)

If a fetcher retrieves data that references entities from another fetcher, the referenced fetcher must come first in the sync order.

## Output Format

Return ONLY valid JSON with this structure:

\`\`\`json
{
  "version": "1.0",
  "source": "${serverName}",
  "displayName": "${displayName}",
  "syncOrder": [
    "list_users",
    "list_teams",
    "list_statuses",
    "list_projects",
    "list_issues"
  ],
  "fetchers": {
    "list_pages": {
      "tool": "search_pages",
      "description": "Fetch all pages",
      "params": {
        "filter": {
          "property": "object",
          "value": "page"
        }
      },
      "pagination": {
        "type": "cursor",
        "limitParam": "page_size",
        "cursorParam": "start_cursor",
        "cursorPath": "$.next_cursor"
      },
      "resultPath": "$.results"
    }
  },
  "recordTypes": {
    "page": {
      "name": "page",
      "fetcher": "list_pages",
      "detection": {
        "condition": "record.object === 'page'"
      },
      "enrichments": [
        {
          "name": "blocks",
          "tool": "get_page_blocks",
          "paramMapping": {
            "page_id": "$.id"
          },
          "resultPath": "$.results"
        }
      ],
      "entities": [
        {
          "name": "status",
          "type": "Status",
          "idPath": "$.properties.Status.status.id",
          "titlePath": "$.properties.Status.status.name",
          "condition": "record.properties?.Status?.status?.id",
          "properties": {
            "color": "$.properties.Status.status.color"
          }
        },
        {
          "name": "assignee",
          "type": "User",
          "idPath": "$.properties.Assignee.people[0].id",
          "titlePath": "$.properties.Assignee.people[0].name",
          "condition": "record.properties?.Assignee?.people?.[0]?.id"
        }
      ],
      "relationships": [
        {
          "name": "page_status",
          "type": "HAS_STATUS",
          "targetType": "Status",
          "targetIdPath": "$.properties.Status.status.id",
          "condition": "record.properties?.Status?.status?.id"
        },
        {
          "name": "page_assignee",
          "type": "ASSIGNED_TO",
          "targetType": "User",
          "targetIdPath": "$.properties.Assignee.people[0].id",
          "condition": "record.properties?.Assignee?.people?.[0]?.id"
        }
      ],
      "fields": {
        "title": {
          "type": "path",
          "path": "$.properties.title.title[0].plain_text"
        },
        "content": {
          "type": "processor",
          "processor": "notion-blocks",
          "input": "enrichments.blocks"
        },
        "primaryDate": {
          "type": "path",
          "path": "$.created_time"
        },
        "tags": {
          "type": "paths",
          "paths": [
            "$.properties.Tags.multi_select[*].name"
          ]
        }
      }
    }
  }
}
\`\`\`

## Important Rules

- Use **processors** for rich content (Notion blocks, Slack mrkdwn, etc.)
- Use **enrichments** only when necessary (e.g., fetching blocks for pages)
- Use **JSONPath** syntax: \`$.\` for root, \`[*]\` for arrays
- Set **pagination** if the tool supports it
- Add **incrementalSync** if the tool supports time-based filtering
- Ensure **detection** logic correctly identifies record types

Generate the IndexingConfig now:`;
}
