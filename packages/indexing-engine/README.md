# @almanac/indexing-engine

Config-based indexing engine for MCP servers. Eliminates the need for hand-coded adapters by using LLM-generated configurations.

## Status: Production Ready ✅

All core features are complete and operational.

## Features

### ✅ Core Components

- **IndexingConfig Schema** - YAML/JSON configuration for any MCP server
- **RecordTransformer** - Transforms raw data using field mappings
- **Sandbox Executor** - Safe execution of custom TypeScript code
- **Format Processors** - 6 built-in processors for rich content

### ✅ Field Mapping Types

```typescript
// 1. Path mapping - Extract via JSONPath
{ type: 'path', path: '$.properties.title.title[0].plain_text' }

// 2. Multiple paths - Combine multiple fields
{ type: 'paths', paths: ['$.first_name', '$.last_name'], join: ' ' }

// 3. Template - String interpolation
{ type: 'template', template: '{{user.name}} - {{user.email}}' }

// 4. Code - Custom TypeScript (sandboxed)
{ type: 'code', code: 'return record.items.map(i => i.name).join(", ")' }

// 5. Processor - Format conversion
{ type: 'processor', processor: 'notion-blocks', input: 'enrichments.blocks' }
```

### ✅ Format Processors

| Processor           | Purpose                      | Example Use Case       |
| ------------------- | ---------------------------- | ---------------------- |
| `notion-rich-text`  | Rich text → Markdown         | Notion property values |
| `notion-blocks`     | Block array → Formatted doc  | Notion page content    |
| `slack-mrkdwn`      | Slack markdown → Standard MD | Slack messages         |
| `fathom-transcript` | Structured transcript        | Fathom meeting notes   |
| `html-to-markdown`  | HTML → Markdown              | Web content            |
| `extract-text`      | Plain text extraction        | Any text content       |

## Installation

```bash
cd packages/indexing-engine
pnpm install
pnpm build
```

## Usage

### Basic Transformation

```typescript
import { RecordTransformer } from '@almanac/indexing-engine';

const recordTypeConfig = {
  name: 'page',
  fetcher: 'list_pages',
  detection: {
    condition: "record.object === 'page'",
  },
  fields: {
    title: {
      type: 'path',
      path: '$.properties.title.title[0].plain_text',
    },
    content: {
      type: 'processor',
      processor: 'notion-blocks',
      input: 'enrichments.blocks',
    },
  },
};

const transformer = new RecordTransformer(recordTypeConfig, 'notion');

const result = await transformer.transform({
  record: rawNotionPage,
  enrichments: {
    blocks: pageBlocks,
  },
});

// result = {
//   _id: 'notion_page_abc123',
//   source: 'notion',
//   sourceId: 'abc123',
//   recordType: 'page',
//   title: 'My Page',
//   content: '# Heading\n\nParagraph...',
//   ...
// }
```

### Using Format Processors Directly

```typescript
import { getFormatProcessor } from '@almanac/indexing-engine';

const processor = getFormatProcessor('notion-blocks');
const markdown = processor(notionBlocks);
```

### IndexingConfig Example

```yaml
version: '1.0'
source: 'notion'
displayName: 'Notion Workspace'

fetchers:
  list_pages:
    tool: search_pages
    pagination:
      type: cursor
      limitParam: page_size
      cursorParam: start_cursor
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

      people:
        type: paths
        paths:
          - $.created_by.email
          - $.last_edited_by.email

      sourceCreatedAt:
        type: path
        path: $.created_at
      sourceUpdatedAt:
        type: path
        path: $.created_time

      tags:
        type: code
        code: |
          const tags = [];
          if (record.properties.Tags?.multi_select) {
            tags.push(...record.properties.Tags.multi_select.map(t => t.name));
          }
          return tags;
```

## Integration

### Server-Side Integration

The indexing engine is integrated with the server via:

```typescript
// packages/server/src/services/indexing/config/config-indexer.service.ts
import { RecordTransformer } from '@almanac/indexing-engine';

const indexer = new ConfigBasedIndexer(config, serverName);

// Full sync
for await (const { records } of indexer.indexAll()) {
  // Save to MongoDB, vector store, graph
}

// Incremental sync
for await (const { records } of indexer.runIncrementalSync()) {
  // Save updates only
}
```

### API Endpoints

```bash
# Generate config with LLM
POST /api/indexing-config/generate
{
  "serverName": "notion",
  "sampleLimit": 3
}

# Preview transformation
POST /api/indexing-config/preview
{
  "config": {...},
  "sampleRecords": [...],
  "recordTypeName": "page"
}

# Save config
POST /api/indexing-config/save
{
  "config": {...}
}

# Trigger sync
POST /api/indexing-config/sync
{
  "serverName": "notion",
  "incremental": false
}

# List configs
GET /api/indexing-config

# Get specific config
GET /api/indexing-config/:serverName

# Delete config
DELETE /api/indexing-config/:serverName
```

## Architecture

```
packages/indexing-engine/
├── src/
│   ├── types/
│   │   ├── config.ts           # IndexingConfig schema
│   │   ├── execution.ts        # TransformedRecord, etc.
│   │   ├── format-processors.ts # Processor interfaces
│   │   └── index.ts
│   ├── executor/
│   │   ├── format-processors.ts # 6 built-in processors
│   │   ├── sandbox.ts           # Code execution
│   │   └── transformer.ts       # Field mapping engine
│   └── index.ts                 # Public exports
```

## Server Integration Components

Located in `packages/server/src/services/indexing/config/`:

- **PaginatedFetcher** - Handles cursor/offset pagination
- **EnrichmentExecutor** - Fetches additional data per record
- **ConfigBasedIndexer** - Orchestrates fetch → enrich → transform
- **ConfigGeneratorService** - LLM-powered config generation

## TypeScript Types

```typescript
interface IndexingConfig {
  version: string;
  source: string;
  displayName?: string;

  fetchers: Record<string, FetcherConfig>;
  recordTypes: Record<string, RecordTypeConfig>;
}

interface RecordTypeConfig {
  name: string;
  fetcher: string;
  detection: DetectionConfig;
  enrichments?: EnrichmentConfig[];
  fields: Record<string, FieldMapping>;
  relationships?: RelationshipMapping[];
}

type FieldMapping =
  | { type: 'path'; path: string }
  | { type: 'paths'; paths: string[]; join?: string }
  | { type: 'template'; template: string }
  | { type: 'code'; code: string }
  | { type: 'processor'; processor: string; input: string };
```

## Benefits

✅ **Zero-code adapters** - LLM generates configs automatically  
✅ **Any MCP server** - Works with any MCP-compatible server  
✅ **Flexible mapping** - 5 field mapping types  
✅ **Rich content** - 6 format processors  
✅ **Safe execution** - Sandboxed TypeScript code  
✅ **Pagination** - Cursor and offset support  
✅ **Enrichment** - Fetch additional data per record  
✅ **Incremental sync** - Only fetch updates

## Development

```bash
# Build
pnpm build

# Type check
pnpm typecheck

# Watch mode
pnpm build --watch
```

## License

MIT
