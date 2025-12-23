export interface ConfigPromptInput {
  serverName: string;
  displayName: string;
  tools: Array<{
    name: string;
    description?: string;
    inputSchema: any;
  }>;
  samples: Record<string, any>;
}

/**
 * Generate prompt for LLM to create an IndexingConfig
 */
export function generateConfigPrompt(input: ConfigPromptInput): string {
  const { serverName, displayName, tools, samples } = input;

  return `# Generate IndexingConfig for "${displayName}"

You are an expert at creating IndexingConfig files for MCP servers. Your task is to generate a valid IndexingConfig in YAML format that will enable automated data indexing from the "${displayName}" MCP server.

## Available Tools

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

## Format Processors

Use these built-in processors for rich content:

- **notion-rich-text**: Convert Notion rich text array to Markdown
- **notion-blocks**: Convert Notion blocks array to formatted Markdown document
- **slack-mrkdwn**: Convert Slack markdown to standard Markdown
- **fathom-transcript**: Format Fathom meeting transcript with speaker names
- **html-to-markdown**: Convert HTML to Markdown
- **extract-text**: Extract plain text from any format

## Field Mapping Types

1. **path**: Simple JSONPath extraction
   \`\`\`yaml
   title:
     type: path
     path: $.properties.Name.title[0].text.content
   \`\`\`

2. **paths**: Combine multiple paths
   \`\`\`yaml
   tags:
     type: paths
     paths:
       - $.properties.Tags.multi_select[*].name
       - $.properties.Status.status.name
   \`\`\`

3. **template**: String template
   \`\`\`yaml
   title:
     type: template
     template: "\${record.name} - \${record.id}"
   \`\`\`

4. **processor**: Use format processor
   \`\`\`yaml
   content:
     type: processor
     processor: notion-blocks
     input: $.blocks
   \`\`\`

5. **code**: TypeScript code for complex transformations
   \`\`\`yaml
   content:
     type: code
     code: |
       // Access: record, enrichments
       return enrichments.blocks
         .map(b => b.text)
         .join('\\n');
   \`\`\`

## Enrichments

Define additional fetches per record:

\`\`\`yaml
enrichments:
  - name: blocks
    tool: get_page_blocks
    paramMapping:
      page_id: $.id
    resultPath: $.results
\`\`\`

## Instructions

1. **Analyze the tools** and sample data to understand the data structure
2. **Create fetchers** for each tool that retrieves records
3. **Define record types** with detection logic
4. **Map fields** to the target schema using appropriate mapping types
5. **Add enrichments** if additional data is needed per record
6. **Use format processors** for rich content (Notion blocks, Slack messages, etc.)

## Output Format

Return ONLY valid YAML with this structure:

\`\`\`yaml
version: "1.0"
source: "${serverName}"
displayName: "${displayName}"

fetchers:
  list_pages:
    tool: search_pages
    description: "Fetch all pages"
    params:
      filter:
        property: object
        value: page
    pagination:
      type: cursor
      limitParam: page_size
      cursorParam: start_cursor
      cursorPath: $.next_cursor
    resultPath: $.results

recordTypes:
  page:
    name: page
    fetcher: list_pages
    detection:
      condition: "record.object === 'page'"
    
    enrichments:
      - name: blocks
        tool: get_page_blocks
        paramMapping:
          page_id: $.id
        resultPath: $.results
    
    fields:
      title:
        type: path
        path: $.properties.title.title[0].plain_text
      
      content:
        type: processor
        processor: notion-blocks
        input: enrichments.blocks
      
      primaryDate:
        type: path
        path: $.created_time
      
      tags:
        type: paths
        paths:
          - $.properties.Tags.multi_select[*].name
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
