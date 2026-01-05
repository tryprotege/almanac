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

**Batch Mode (Efficiency Optimization):**

When a tool accepts an **array parameter** (e.g., teams: string[]), use **batchMode** instead of making one call per item:

\`\`\`json
{
  "forEach": {
    "source": "list_teams",
    "path": "$[*]",
    "batchMode": {
      "batchParam": "teams",
      "valueMapping": "$.name",
      "batchSize": 100
    }
  }
}
\`\`\`

This makes **1 call** with {teams: ["Team1", "Team2", ...]} instead of N individual calls.

**How to detect batch mode support:**
1. Check the tool's input schema for array-type parameters
2. Look for descriptions mentioning "list of", "multiple", "array"
3. If the param type is "array", use batchMode instead of paramMapping

**When to use batch mode:**
- Tool schema shows array parameter (e.g., teams: { type: "array", items: { type: "string" } })
- Large datasets where individual calls would be too slow
- The tool explicitly supports batch operations

**When NOT to use batch mode:**
- Tool doesn't accept array parameters (use regular forEach with paramMapping)
- Very small datasets (< 10 items) where individual calls are fine
- Tool documentation indicates batch limits that are too small

## Post-Fetch Grouping (For Messaging & Threaded Content)

For messaging platforms (Slack, WhatsApp, Discord) or any content with thread-like structures, use the grouping configuration to automatically group related records and create parent records.

### When to Use Grouping

Use grouping when:
- ✅ Platform has threaded messages (Slack threads, email threads, forum threads)
- ✅ Chat messages should be grouped into conversations
- ✅ Records have natural parent-child relationships that need explicit modeling
- ✅ You want to create aggregate records representing groups

Do NOT use grouping when:
- ❌ Records are already independent entities (tasks, issues, documents)
- ❌ Parent-child relationships already explicit via parentId field
- ❌ No meaningful grouping exists

### Grouping Strategies

**1. Thread Strategy**: For platforms with explicit thread IDs (Slack thread_ts, email thread_id, Discord thread_id). Use threadIdPath and parentIndicatorPath to identify threads.

**2. LLM Conversation Strategy**: For chat platforms without explicit thread IDs. Uses AI to semantically group messages into conversations based on topic continuity and context.

**3. Time Window Strategy**: Groups records within a time window (e.g., 1 hour). Optionally filters by same user and context.

**4. User Session Strategy**: Groups user activity into sessions with configurable timeout.

### Key Configuration Fields

- **strategy**: One of "thread", "llm_conversation", "time_window", "user_session"
- **config**: Strategy-specific settings (paths to fields, thresholds, etc.)
- **parentRecord**: Defines how to create parent records
  - recordType: Type name for parent records (e.g., "thread", "conversation")
  - sourceIdStrategy: How to generate parent IDs ("first_child", "hash", "concatenate", "template")
  - sourceIdTemplate: Template for parent IDs
  - fields: Parent record fields using aggregate mappings

### Aggregate Mapping Functions

Use these in parentRecord.fields to aggregate child data:
- **concat**: Concatenate text from all children (supports itemTemplate and separator)
- **merge**: Merge arrays/objects from children
- **first**: Take value from first child
- **last**: Take value from last child
- **unique**: Collect unique values across children

### Grouping Configuration Location

Add grouping at the RecordTypeConfig level (inside recordTypes, not at top level).

### Messaging Platform Guidelines

**Slack:**
- Use thread strategy with threadIdPath pointing to thread_ts field
- Parent record type: "thread"
- Aggregate user names from user field
- Include timestamps in content template

**WhatsApp / General Chat:**
- Use llm_conversation strategy for semantic grouping
- Parent record type: "conversation"
- Sort by timestamp before grouping
- Use larger minGroupSize (3-5) to avoid trivial groups

**Discord:**
- Use thread strategy with threadIdPath pointing to thread_id field
- Similar to Slack configuration
- Consider channel context in relationships

**Email:**
- Use thread strategy with threadIdPath pointing to thread_id field
- Parent record type: "email_thread"
- Aggregate sender emails into people field

## Instructions

1. **Analyze the tools** and sample data to understand the data structure
2. **Create fetchers** for each tool that retrieves records
3. **Define record types** with detection logic
4. **Map fields** to the target schema using appropriate mapping types
5. **Add enrichments** if additional data is needed per record
6. **Use format processors** for rich content (Notion blocks, Slack messages, etc.)
7. **Add grouping configuration** for messaging platforms or threaded content

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

## ⚠️ CRITICAL ANTI-PATTERNS TO AVOID

These patterns will cause immediate failure. DO NOT include them in your config:

### 1. Missing arrayPath for List/Array Responses
❌ **NEVER** forget arrayPath when resultPath points to an array:
\`\`\`json
{
  "fetchers": {
    "list_meetings": {
      "tool": "list_meetings",
      "resultPath": "$.content[0].text",  // Returns: {"items": [{...}, {...}]}
      // ❌ MISSING: arrayPath to extract individual items
    }
  }
}
\`\`\`

This will treat the ENTIRE response object as ONE record, causing "Record missing ID field" errors.

✅ **ALWAYS** add arrayPath to extract individual items:
\`\`\`json
{
  "fetchers": {
    "list_meetings": {
      "tool": "list_meetings",
      "resultPath": "$.content[0].text",  // Extract the JSON string
      "arrayPath": "$.items[*]",          // ✅ Extract each item from the array
      "pagination": { "type": "cursor", ... }
    }
  }
}
\`\`\`

**How to detect when arrayPath is needed:**
1. Look at the sample response structure
2. If it contains an array of objects (like \`{"items": [...]}\`, \`{"results": [...]}\`, \`{"data": [...]}\`)
3. You MUST add arrayPath to extract individual objects from that array

### 2. Creating Record Types for Enrichment-Only Tools
❌ **NEVER** create separate record types for tools that only enrich existing records:
\`\`\`json
{
  "recordTypes": {
    "meeting": {
      "fetcher": "list_meetings",
      "enrichments": [
        { "name": "transcript", "tool": "get_transcript", ... }
      ]
    },
    "transcript": {  // ❌ WRONG: Transcript should NOT be a separate record type
      "fetcher": "get_transcript",
      "detection": { "always": true }
    }
  }
}
\`\`\`

This creates duplicate processing and causes errors when enrichment tools are called without proper parameters.

✅ **ONLY** use enrichment tools within enrichments:
\`\`\`json
{
  "recordTypes": {
    "meeting": {
      "fetcher": "list_meetings",
      "enrichments": [
        {
          "name": "transcript",
          "tool": "get_transcript",  // ✅ Used as enrichment only
          "paramMapping": { "recording_id": "$.recording_id" }
        }
      ]
    }
    // ✅ NO separate transcript record type
  }
}
\`\`\`

**How to identify enrichment-only tools:**
- Tool name starts with "get_" or "fetch_" (singular)
- Tool requires an ID parameter (page_id, recording_id, issue_id, etc.)
- Tool returns details for ONE specific entity
- Cannot be called without parameters to discover all entities

**These should be enrichments, NOT record types:**
- ✅ get_transcript (requires recording_id) → enrichment
- ✅ get_page_details (requires page_id) → enrichment
- ✅ fetch_issue_comments (requires issue_id) → enrichment

**These can be PRIMARY record types:**
- ✅ list_meetings (lists all meetings) → record type
- ✅ search_pages (discovers all pages) → record type
- ✅ get_all_issues (gets all issues) → record type

### 3. Placeholder/Hardcoded Values in Fetcher Params
❌ **NEVER** use placeholder or example values:
\`\`\`json
{
  "fetchers": {
    "get_issue": {
      "tool": "get_issue",
      "params": {
        "issue_id": "EXAMPLE-123",  // ❌ WRONG: Placeholder value
        "project": "your-project"    // ❌ WRONG: "your-" prefix is a placeholder
      }
    }
  }
}
\`\`\`

✅ **CORRECT** approach for discovery:
- Use list/search tools without hardcoded IDs as PRIMARY fetchers
- Use single-fetch tools ONLY in enrichments with paramMapping from parent records
- If you see a tool that requires specific IDs, it should be an enrichment, not a primary fetcher

### 4. Fetchers That Can't Discover Records
❌ **NEVER** create fetchers with identifier params as primary data source:
\`\`\`json
{
  "fetchers": {
    "get_page": {
      "tool": "get_page",
      "params": {
        "page_id": "abc123"  // ❌ WRONG: Can only fetch ONE specific page
      }
    }
  }
}
\`\`\`

✅ **CORRECT** discovery mechanism:
\`\`\`json
{
  "fetchers": {
    "list_pages": {
      "tool": "search_pages",  // ✅ Lists ALL pages
      "params": {},
      "pagination": { "type": "cursor", ... }
    }
  },
  "recordTypes": {
    "page": {
      "fetcher": "list_pages",
      "enrichments": [
        {
          "name": "page_details",
          "tool": "get_page",  // ✅ Single-fetch used in enrichment
          "paramMapping": { "page_id": "$.id" }
        }
      ]
    }
  }
}
\`\`\`

### 5. Unresolvable Enrichment Paths
❌ **NEVER** use paths in paramMapping that don't exist in sample data:
\`\`\`json
{
  "enrichments": [
    {
      "name": "details",
      "tool": "get_details",
      "paramMapping": {
        "id": "$.nonexistent_field"  // ❌ Field doesn't exist in sample
      }
    }
  ]
}
\`\`\`

✅ **VERIFY** paths against sample data:
- Check that the path exists in the actual sample response
- Test the JSONPath expression mentally: does \`$.field\` exist?
- If nested, verify each level: \`$.parent.child\` requires both to exist

### 6. Wrong Primary Fetcher Selection
❌ **NEVER** use these as PRIMARY fetchers:
- Tools with "get_" prefix that require specific IDs
- Tools with "fetch_" that need identifiers
- Single-item retrieval tools
- Tools that return one specific entity

✅ **USE** these as PRIMARY fetchers:
- Tools with "list_" prefix
- Tools with "search_" prefix
- Tools that "get all" or "retrieve multiple"
- Tools with pagination support

### 7. Missing Pagination
❌ **NEVER** ignore pagination if the tool supports it:
\`\`\`json
{
  "fetchers": {
    "list_all": {
      "tool": "list_items",
      // ❌ MISSING: pagination config
      "resultPath": "$.items"
    }
  }
}
\`\`\`

✅ **ALWAYS** add pagination when supported:
\`\`\`json
{
  "fetchers": {
    "list_all": {
      "tool": "list_items",
      "pagination": {  // ✅ Fetches ALL pages
        "type": "cursor",
        "cursorParam": "page_token",
        "cursorPath": "$.next_page_token"
      },
      "resultPath": "$.items"
    }
  }
}
\`\`\`

## Validation Checklist

Before generating, verify:

1. ✅ All fetchers use list/search tools (not get/fetch with IDs)
2. ✅ No placeholder values (no "example", "your-", "test", "123", etc.)
3. ✅ All paramMapping paths verified against sample data
4. ✅ Pagination configured for tools that support it
5. ✅ Single-fetch tools used ONLY in enrichments
6. ✅ forEach used when tools need dynamic params from earlier fetchers

## Important Rules

- Use **processors** for rich content (Notion blocks, Slack mrkdwn, etc.)
- Use **enrichments** only when necessary (e.g., fetching blocks for pages)
- Use **JSONPath** syntax: \`$.\` for root, \`[*]\` for arrays
- Set **pagination** if the tool supports it
- Add **incrementalSync** if the tool supports time-based filtering
- Ensure **detection** logic correctly identifies record types

Generate the IndexingConfig now:`;
}
