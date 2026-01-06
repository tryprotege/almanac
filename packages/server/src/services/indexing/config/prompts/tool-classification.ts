/**
 * Prompt for classifying MCP tools into read/search/write categories
 */

export interface ToolClassificationPromptInput {
  tools: Array<{
    name: string;
    description?: string;
    inputSchema: any;
  }>;
}

/**
 * Generate prompt for LLM to classify MCP tools
 */
export function generateToolClassificationPrompt(
  input: ToolClassificationPromptInput
): string {
  const { tools } = input;

  return `You are classifying MCP (Model Context Protocol) tools for a data indexing system.

Your task: Classify each tool into ONE of these categories based on its operation type.

# Category Definitions

## READ
Tools that retrieve/fetch data WITHOUT modifying state or having side effects:
- **List operations**: list_pages, get_users, fetch_records, list_repositories
- **Get single item**: get_page, get_user, read_file, get_repository
- **Export/download**: export_data, download_file, get_transcript
- **Query operations**: query_database (if read-only)
- These tools WILL be used for indexing

Examples of READ tools:
- list_pages: Returns a list of all pages
- get_page: Retrieves a specific page by ID
- fetch_users: Gets all users from the system
- get_meeting_transcript: Downloads meeting transcript

## SEARCH
Tools that filter/search through data with specific query parameters:
- **Search operations**: search_pages, find_users, search_repositories
- **Filter operations**: filter_by_date, filter_by_status
- **Query with parameters**: search_messages, find_documents
- These require specific search terms/filters to work
- SKIP for initial indexing (cannot enumerate all possible results without parameters)
- May be used if needed to get a subset of results during indexing

Examples of SEARCH tools:
- search_pages: Requires query parameter to search
- find_users: Needs search criteria
- filter_messages: Requires filter parameters

## WRITE
Tools that CREATE, UPDATE, DELETE, or otherwise MODIFY data:
- **Create operations**: create_page, add_user, post_message, create_issue
- **Update operations**: update_page, edit_user, modify_record, update_status
- **Delete operations**: delete_page, remove_user, archive_item, trash_file
- **Send/publish**: send_message, publish_post, send_email
- **Any operation with side effects**
- These tools will NEVER be used for indexing
- These tools are always passed through to the upstream MCP server

Examples of WRITE tools:
- create_page: Creates a new page
- update_user: Modifies user data
- delete_file: Removes a file
- send_message: Sends a message (side effect)

# Analysis Guidelines

1. **Prioritize the tool name** - Names like "create_", "update_", "delete_" are strong indicators
2. **Check the description** - Look for words like "creates", "modifies", "deletes", "sends"
3. **Examine input schema** - Required parameters that specify data to write indicate WRITE
4. **Consider side effects** - Does calling this tool change system state?
5. **When in doubt**:
   - If it could modify data → WRITE
   - If it requires search parameters → SEARCH
   - If it just retrieves data → READ

# Tools to Classify

${tools
  .map(
    (tool, index) => `
## Tool ${index + 1}: ${tool.name}

**Description:** ${tool.description || "No description provided"}

**Input Schema:**
\`\`\`json
${JSON.stringify(tool.inputSchema, null, 2)}
\`\`\`
`
  )
  .join("\n")}

# Output Format

Return a valid JSON array with one classification per tool:

\`\`\`json
[
  {
    "toolName": "exact_tool_name",
    "category": "read"
  },
  {
    "toolName": "exact_tool_name_2",
    "category": "write"
  }
]
\`\`\`

**Important:**
- Use exact tool names from the input
- Return ONLY the JSON array, no other text
- Classify ALL ${tools.length} tools

Now classify these tools:`;
}
