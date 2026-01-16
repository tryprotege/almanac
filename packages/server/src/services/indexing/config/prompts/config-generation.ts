export interface ConfigPromptInput {
  serverName: string;
  displayName: string;
  tools: Array<{
    name: string;
    description?: string;
    inputSchema: any;
  }>;
  samples: Record<string, any>;
  classifications?: Record<string, any>;
  userGuidance?: string;
  failureReasons?: Record<string, string>;
}

/**
 * Generate prompt for LLM to create an IndexingConfig
 */
export function generateConfigPrompt(input: ConfigPromptInput): string {
  const { serverName, displayName, tools, samples, userGuidance } = input;

  // Build tool catalog with samples
  const toolCatalog = tools.map((tool) => {
    const sample = samples[tool.name];
    const hasValidSample = sample && !sample.error;

    return {
      tool,
      hasValidSample,
      sample: hasValidSample ? sample : null,
    };
  });

  const withSamples = toolCatalog.filter((t) => t.hasValidSample).length;
  const withoutSamples = toolCatalog.length - withSamples;

  console.log(`Tool catalog: ${withSamples} tools with samples, ${withoutSamples} without samples`);

  // Build user guidance section if provided
  const guidanceSection = userGuidance
    ? `
## ⚠️ USER-PROVIDED GUIDANCE (CRITICAL - FOLLOW THESE INSTRUCTIONS)

${userGuidance}

---

`
    : '';

  return `# IndexingConfig Generation for "${displayName}"

You are an expert at building data indexing configurations. Your goal is to **collect the PRIMARY searchable content** from the "${displayName}" platform and make it available for semantic search and RAG queries.

${guidanceSection}

# STEP 1: IDENTIFY PRIMARY CONTENT

Before examining tools, determine what users would want to search for on this platform:

## Platform Type Quick Reference

| Platform Type | Primary Content | Secondary Content | Example |
|--------------|-----------------|-------------------|---------|
| **Document/Wiki** | Pages, articles, docs | Comments, attachments | Notion, Confluence, Coda |
| **Issue Tracker** | Issues, tasks, tickets | Comments, status updates | Linear, Jira, GitHub Issues |
| **Chat/Messaging** | Messages, threads | Channel metadata, reactions | Slack, Discord, Teams |
| **Call Recording** | Meeting recordings | Transcripts, summaries, highlights | Fathom, Gong, Fireflies |
| **Code Repository** | Pull requests, issues | Commits, files, discussions | GitHub, GitLab, Bitbucket |
| **CRM** | Contacts, deals, companies | Activities, notes, emails | Salesforce, HubSpot |
| **Project Management** | Projects, tasks, milestones | Updates, dependencies | Asana, Monday, ClickUp |

**For "${displayName}":**
1. What is the PRIMARY content users search for?
2. What makes each item unique and discoverable?
3. What relationships connect content pieces?

# STEP 2: ANALYZE AVAILABLE TOOLS

The tools below are READ-ONLY operations (write operations are handled separately).

## Tool Catalog

${toolCatalog
  .map((entry) => {
    const { tool, hasValidSample, sample } = entry;

    let sampleSection = '';
    if (hasValidSample) {
      sampleSection = `
**Sample Response:**
\`\`\`json
${JSON.stringify(sample, null, 2)}
\`\`\``;
    }

    return `### ${tool.name}
${tool.description || 'No description'}

**Input Schema:**
\`\`\`json
${JSON.stringify(tool.inputSchema, null, 2)}
\`\`\`${sampleSection}`;
  })
  .join('\n\n')}

# STEP 3: SELECT DISCOVERY & ENRICHMENT TOOLS

## Discovery Tools (PRIMARY FETCHERS)

These tools DISCOVER records without requiring specific IDs. They become primary fetchers:

**Patterns to look for:**
- \`list_*\` - Lists all items of a type
- \`search_*\` - Searches for items (often with filters)
- \`query_*\` - Queries with conditions
- \`get_all_*\` - Retrieves all items

**✅ USE AS PRIMARY FETCHERS when:**
- Tool can be called with empty or minimal params
- Returns MULTIPLE items (array/list)
- Supports pagination (look for cursor/page params)

**❌ DO NOT use as primary fetchers:**
- Tools requiring specific IDs (page_id, issue_id, etc.)
- Tools with "get_" prefix that fetch single items
- Admin/metadata tools (unless that's the primary content)

## Enrichment Tools (DETAIL FETCHERS)

These fetch additional details for discovered records:

**Patterns to look for:**
- \`get_*\` or \`retrieve_*\` with ID parameter
- \`fetch_*_details\` or \`get_*_content\`
- Tools that expand/detail primary records

**✅ USE AS ENRICHMENTS when:**
- Tool requires an ID from a primary record
- Provides rich content (full text, blocks, transcript)
- Returns data that should be searchable

**When to use enrichments:**
- ✅ Full page content (Notion blocks, document body)
- ✅ Meeting transcripts or call summaries
- ✅ Issue comments or discussion threads
- ❌ Simple metadata already in primary fetch
- ❌ Redundant data that adds no search value

# STEP 4: PLATFORM-SPECIFIC PATTERNS

## Document/Wiki Platform Pattern
**Primary Goal:** Index all pages/documents with full content

\`\`\`json
{
  "fetchers": {
    "list_pages": {
      "tool": "search_pages",
      "params": {},
      "pagination": {
        "type": "cursor",
        "cursorParam": "start_cursor",
        "cursorPath": "$.next_cursor"
      },
      "resultPath": "$.content[0].text",
      "arrayPath": "$.results[*]"
    }
  },
  "recordTypes": {
    "page": {
      "fetcher": "list_pages",
      "enrichments": [
        {
          "name": "blocks",
          "tool": "get_page_blocks",
          "paramMapping": { "page_id": "$.id" },
          "resultPath": "$.content[0].text"
        }
      ],
      "fields": {
        "title": { "type": "path", "path": "$.properties.title.title[0].plain_text" },
        "content": {
          "type": "processor",
          "processor": "blocks-to-markdown",
          "input": "enrichments.blocks"
        },
        "sourceCreatedAt": { "type": "path", "path": "$.created_time" },
        "sourceUpdatedAt": { "type": "path", "path": "$.last_edited_time" }
      }
    }
  }
}
\`\`\`

## Issue Tracker Pattern
**Primary Goal:** Index all issues/tasks with descriptions

\`\`\`json
{
  "fetchers": {
    "list_issues": {
      "tool": "list_issues",
      "params": {},
      "pagination": { "type": "cursor", "cursorParam": "after", "cursorPath": "$.pageInfo.endCursor" },
      "resultPath": "$.data.issues.nodes"
    }
  },
  "recordTypes": {
    "issue": {
      "fetcher": "list_issues",
      "fields": {
        "title": { "type": "path", "path": "$.title" },
        "content": { "type": "path", "path": "$.description" },
        "people": { "type": "paths", "paths": ["$.assignee.name", "$.creator.name"] },
        "tags": { "type": "paths", "paths": ["$.labels[*].name", "$.state.name"] },
        "sourceCreatedAt": { "type": "path", "path": "$.createdAt" },
        "sourceUpdatedAt": { "type": "path", "path": "$.updatedAt" }
      },
      "entities": [
        {
          "name": "assignee",
          "type": "User",
          "idPath": "$.assignee.id",
          "titlePath": "$.assignee.name",
          "condition": "record.assignee && record.assignee.id"
        },
        {
          "name": "status",
          "type": "Status",
          "idPath": "$.state.id",
          "titlePath": "$.state.name",
          "condition": "record.state && record.state.id"
        }
      ]
    }
  }
}
\`\`\`

## Chat/Messaging Platform Pattern
**Primary Goal:** Index messages, optionally group into threads/conversations

\`\`\`json
{
  "fetchers": {
    "list_channels": {
      "tool": "list_channels",
      "params": {},
      "resultPath": "$.channels"
    },
    "list_messages": {
      "tool": "list_messages",
      "forEach": {
        "source": "list_channels",
        "path": "$[*]",
        "paramMapping": { "channel_id": "$.id" }
      },
      "pagination": { "type": "cursor", "cursorParam": "cursor", "cursorPath": "$.next_cursor" },
      "resultPath": "$.messages"
    }
  },
  "recordTypes": {
    "message": {
      "fetcher": "list_messages",
      "fields": {
        "title": { "type": "template", "template": "Message from \${record.user.name} in \${record.channel.name}" },
        "content": {
          "type": "processor",
          "processor": "markup-to-markdown",
          "input": "$.text"
        },
        "people": { "type": "path", "path": "$.user.name" },
        "sourceCreatedAt": { "type": "path", "path": "$.timestamp" }
      },
      "grouping": {
        "strategy": "thread",
        "config": {
          "threadIdPath": "$.thread_ts",
          "parentIndicatorPath": "$.thread_ts"
        }
      }
    }
  }
}
\`\`\`

## Call Recording Platform Pattern
**Primary Goal:** Index meetings with transcripts and summaries

\`\`\`json
{
  "syncOrder": ["list_meetings", "get_transcripts", "get_summaries"],
  "fetchers": {
    "list_meetings": {
      "tool": "list_meetings",
      "params": {},
      "pagination": { "type": "cursor", "cursorParam": "cursor", "cursorPath": "$.next_cursor" },
      "resultPath": "$.content[0].text",
      "arrayPath": "$.items[*]"
    },
    "get_transcripts": {
      "tool": "get_transcript",
      "forEach": {
        "source": "list_meetings",
        "path": "$[*]",
        "paramMapping": { "recording_id": "$.recording_id" }
      },
      "resultPath": "$.content[0].text"
    },
    "get_summaries": {
      "tool": "get_summary",
      "forEach": {
        "source": "list_meetings",
        "path": "$[*]",
        "paramMapping": { "recording_id": "$.recording_id" }
      },
      "resultPath": "$.content[0].text"
    }
  },
  "recordTypes": {
    "meeting": {
      "fetcher": "list_meetings",
      "fields": {
        "title": { "type": "path", "path": "$.title" },
        "content": { "type": "path", "path": "$.description" },
        "people": { "type": "paths", "paths": ["$.participants[*].name"] },
        "sourceCreatedAt": { "type": "path", "path": "$.start_time" }
      }
    },
    "transcript": {
      "fetcher": "get_transcripts",
      "fields": {
        "title": { "type": "template", "template": "Transcript: \${record.title}" },
        "content": {
          "type": "processor",
          "processor": "transcript-to-markdown",
          "input": "$.transcript"
        },
        "primaryDate": { "type": "path", "path": "$.start_time" }
      },
      "relationships": [
        {
          "name": "transcript_of",
          "type": "TRANSCRIPT_OF",
          "targetType": "meeting",
          "targetIdPath": "$.recording_id"
        }
      ]
    },
    "summary": {
      "fetcher": "get_summaries",
      "fields": {
        "title": { "type": "template", "template": "Summary: \${record.title}" },
        "content": { "type": "path", "path": "$.summary" },
        "primaryDate": { "type": "path", "path": "$.start_time" }
      },
      "relationships": [
        {
          "name": "summary_of",
          "type": "SUMMARY_OF",
          "targetType": "meeting",
          "targetIdPath": "$.recording_id"
        }
      ]
    }
  }
}
\`\`\`

# STEP 5: BUILD YOUR CONFIG

Using the patterns above as guidance, create a config for "${displayName}":

1. **Identify discovery tools** from the tool catalog (tools that list/search without IDs)
2. **Select enrichment tools** that provide full content for discovered items
3. **Map fields** to the standard schema (title, content, people, primaryDate, tags)
4. **Extract entities** from sample data (users, statuses, projects, etc.)
5. **Define relationships** between records and entities

## Standard Field Schema

Map discovered data to these unified fields:

- **title** (required): Short, human-readable title/summary
- **content** (required): Main searchable text content
- **people** (optional): Names or IDs of people involved
- **primaryDate** (optional): Main timestamp (created, modified, published)
- **tags** (optional): Categories, labels, statuses
- **parentId** (optional): Reference to parent record

## Config Structure

\`\`\`json
{
  "version": "1.0",
  "source": "${serverName}",
  "displayName": "${displayName}",
  "syncOrder": ["discovery_fetcher_1", "discovery_fetcher_2", "enrichment_fetcher_1"],
  "fetchers": {
    "discovery_fetcher_1": {
      "tool": "list_something",
      "params": {},
      "pagination": { "type": "cursor", "cursorParam": "cursor", "cursorPath": "$.next" },
      "resultPath": "$.items"
    }
  },
  "recordTypes": {
    "primary_type": {
      "fetcher": "discovery_fetcher_1",
      "enrichments": [
        {
          "name": "details",
          "tool": "get_details",
          "paramMapping": { "id": "$.id" },
          "resultPath": "$.content"
        }
      ],
      "fields": {
        "title": { "type": "path", "path": "$.name" },
        "content": { "type": "path", "path": "enrichments.details" },
        "sourceCreatedAt": { "type": "path", "path": "$.created_at" },
        "sourceUpdatedAt": { "type": "path", "path": "$.updated_at" }
      },
      "entities": [
        {
          "name": "creator",
          "type": "User",
          "idPath": "$.creator.id",
          "titlePath": "$.creator.name",
          "condition": "record.creator && record.creator.id"
        }
      ],
      "relationships": [
        {
          "name": "created_by",
          "type": "CREATED_BY",
          "targetType": "User",
          "targetIdPath": "$.creator.id",
          "condition": "record.creator && record.creator.id"
        }
      ]
    }
  }
}
\`\`\`

---

# TECHNICAL REFERENCE

## Field Mapping Types

**⚠️ Records are passed as INDIVIDUAL OBJECTS, not arrays!**

1. **path**: Simple JSONPath extraction
   \`{ "type": "path", "path": "$.field.nested" }\`

2. **paths**: Combine multiple paths into array
   \`{ "type": "paths", "paths": ["$.field1", "$.field2[*]"] }\`

3. **template**: String template with record data
   \`{ "type": "template", "template": "\${record.name} - \${record.id}" }\`

4. **processor**: Use format processor for rich content
   \`{ "type": "processor", "processor": "blocks-to-markdown", "input": "$.blocks" }\`

5. **code**: TypeScript for complex transformations
   \`{ "type": "code", "code": "return record.items.map(i => i.name).join(', ');" }\`

## Format Processors

- **blocks-to-markdown**: Notion blocks → Markdown
- **rich-text-to-markdown**: Rich text arrays → Markdown  
- **markup-to-markdown**: Slack mrkdwn → Markdown
- **transcript-to-markdown**: Transcript segments → formatted Markdown
- **html-to-markdown**: HTML → Markdown
- **extract-text**: Any format → plain text

## forEach (Dynamic Parameters)

When a tool needs parameters from a previous fetcher:

\`\`\`json
{
  "fetchers": {
    "list_teams": { "tool": "list_teams", "resultPath": "$.teams" },
    "list_projects": {
      "tool": "list_projects",
      "forEach": {
        "source": "list_teams",
        "path": "$[*]",
        "paramMapping": { "team_id": "$.id" },
        "concurrency": 3
      },
      "resultPath": "$.projects"
    }
  }
}
\`\`\`

## Pagination

\`\`\`json
{
  "pagination": {
    "type": "cursor",          // or "offset"
    "cursorParam": "cursor",   // param name for cursor
    "cursorPath": "$.next_cursor",  // path to next cursor in response
    "limitParam": "limit"      // optional: page size param
  }
}
\`\`\`

## Entities & Relationships

Extract embedded objects as graph entities:

\`\`\`json
{
  "entities": [
    {
      "name": "assignee",
      "type": "User",
      "idPath": "$.assignee.id",
      "titlePath": "$.assignee.name",
      "condition": "record.assignee && record.assignee.id",
      "properties": { "email": "$.assignee.email" }
    }
  ],
  "relationships": [
    {
      "name": "assigned_to",
      "type": "ASSIGNED_TO",
      "targetType": "User",
      "targetIdPath": "$.assignee.id",
      "condition": "record.assignee && record.assignee.id"
    }
  ]
}
\`\`\`

## Sync Order

Define execution order for dependent fetchers:

1. **Reference data first** (users, teams, statuses)
2. **Parent containers** (projects, workspaces)
3. **Main content** (issues, documents, messages)
4. **Enrichments last** (comments, details)

Example: \`["list_users", "list_projects", "list_issues", "get_issue_comments"]\`

---

# CRITICAL RULES

1. **arrayPath is REQUIRED** when resultPath returns \`{"items": [...]}\` or similar array-wrapped responses
2. **DO NOT create record types** for enrichment-only tools (tools with ID parameters)
3. **NO placeholder values** in params (no "example", "your-", "test-123")
4. **Pagination MUST be included** for discovery tools that support it
5. **Enrichments MUST be mapped to fields** - unused enrichments are wasted API calls
6. **Use JSONPath correctly** - \`$.field\` not \`$[0].field\` (records are objects, not arrays)

# OUTPUT FORMAT

Return ONLY valid JSON following the structure above. No markdown code fences, no explanations - just the JSON config.

Generate the IndexingConfig now:`;
}
