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
}

/**
 * Generate prompt for LLM to create an IndexingConfig
 */
export function generateConfigPrompt(input: ConfigPromptInput): string {
  const { serverName, displayName, tools, samples } = input;

  return `# Generate IndexingConfig for "${displayName}"

You are an expert at creating IndexingConfig files for MCP servers. Your task is to generate a valid IndexingConfig in JSON format that will enable automated data indexing from the "${displayName}" MCP server.

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

## Instructions

1. **Analyze the tools** and sample data to understand the data structure
2. **Create fetchers** for each tool that retrieves records
3. **Define record types** with detection logic
4. **Map fields** to the target schema using appropriate mapping types
5. **Add enrichments** if additional data is needed per record
6. **Use format processors** for rich content (Notion blocks, Slack messages, etc.)

## Output Format

Return ONLY valid JSON with this structure:

\`\`\`json
{
  "version": "1.0",
  "source": "${serverName}",
  "displayName": "${displayName}",
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
