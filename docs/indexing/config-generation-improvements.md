# Config Generation Improvements

## Overview

Implemented comprehensive safeguards to prevent common config generation failures that cause indexing errors.

## Problems Addressed

### 1. Missing arrayPath

**Symptom:** `Record missing ID field: {"items":[...]}`

**Root Cause:** When a fetcher's resultPath returns an object containing an array (e.g., `{"items": [...], "next_cursor": "..."}`), the system needs `arrayPath` to extract individual items. Without it, the entire wrapper object is treated as a single record, which has no `id` field.

**Solution:**

- Added explicit anti-pattern examples in LLM prompt
- Implemented auto-detection of missing arrayPath in post-validator
- Auto-repair adds `arrayPath: "$.items[*]"` when detected

### 2. Enrichment-Only Tools as Record Types

**Symptom:** Multiple errors from tools like `get_transcript`, `get_summary` being called without proper parameters

**Root Cause:** LLM created separate record types for tools that should only be used as enrichments. Tools like `get_transcript(recording_id)` can't discover records on their own - they need a parent record to provide the ID.

**Solution:**

- Added explicit anti-pattern with examples in LLM prompt
- Implemented detection of enrichment-only tools (tools with `get_*` prefix or requiring ID params)
- Auto-repair removes invalid record types and unused fetchers

### 3. Wrong resultPath Format

**Symptom:** Incorrect data extraction from MCP responses

**Root Cause:** MCP responses are wrapped in `{content: [{text: "..."}]}` format, requiring proper path extraction.

**Solution:** Enhanced prompt examples to show correct `resultPath: "$.content[0].text"` pattern

## Implementation

### 1. Enhanced LLM Prompts

**File:** `packages/server/src/services/indexing/config/prompts/config-generation.ts`

Added three new critical anti-patterns at the top of the validation section:

#### Anti-Pattern 1: Missing arrayPath

```json
// ❌ WRONG
{
  "fetchers": {
    "list_meetings": {
      "resultPath": "$.content[0].text"  // Returns: {"items": [{...}]}
      // MISSING: arrayPath
    }
  }
}

// ✅ CORRECT
{
  "fetchers": {
    "list_meetings": {
      "resultPath": "$.content[0].text",
      "arrayPath": "$.items[*]"  // Extract each item
    }
  }
}
```

#### Anti-Pattern 2: Enrichment-Only Tools as Record Types

```json
// ❌ WRONG - Creating record type for enrichment tool
{
  "recordTypes": {
    "meeting": { ... },
    "transcript": {  // WRONG!
      "fetcher": "get_transcript"
    }
  }
}

// ✅ CORRECT - Only use as enrichment
{
  "recordTypes": {
    "meeting": {
      "fetcher": "list_meetings",
      "enrichments": [
        {
          "name": "transcript",
          "tool": "get_transcript",
          "paramMapping": { "recording_id": "$.recording_id" }
        }
      ]
    }
  }
}
```

### 2. Post-Generation Auto-Repair

**File:** `packages/server/src/services/indexing/config/config-post-validator.service.ts`

Implemented comprehensive validation and auto-repair:

#### New Validation Checks

1. **validateArrayPaths** - Detects when fetchers return arrays but lack arrayPath
2. **validateEnrichmentOnlyTools** - Identifies tools that should only be enrichments
3. **validateEnrichmentPaths** - Verifies paramMapping paths resolve correctly
4. **validateDiscoveryMechanisms** - Ensures fetchers can discover records dynamically
5. **detectPlaceholders** - Catches hardcoded/placeholder values

#### Auto-Repair Logic

The validator now automatically fixes three critical issues:

1. **Add Missing arrayPath**

   - Detects arrays in sample responses
   - Automatically adds `arrayPath: "$.items[*]"` (or appropriate field)
   - Logs repair action

2. **Remove Invalid Record Types**

   - Identifies record types using enrichment-only tools
   - Removes them from config
   - Logs warning

3. **Clean Up Unused Fetchers**
   - Removes fetchers no longer referenced by any record type
   - Updates syncOrder to remove fetcher names
   - Prevents orphaned configurations

#### Recursive Validation

After repairs, the validator recursively re-validates the config to ensure all issues are resolved.

## Benefits

### For Users

- **No More "Missing ID" Errors**: arrayPath is automatically added
- **Cleaner Configs**: Invalid record types automatically removed
- **Better First-Time Success**: LLM receives clearer instructions
- **Self-Healing**: Configs auto-repair common mistakes

### For Development

- **Reduced Support Burden**: Fewer config generation issues
- **Better LLM Guidance**: Explicit anti-patterns prevent common mistakes
- **Maintainability**: Centralized validation logic
- **Debugging**: Clear logging of auto-repairs

## Testing

To test the improvements:

1. **Start the server**

   ```bash
   cd packages/server && npm run dev
   ```

2. **Navigate to Data Sources** in the UI

3. **Add a new data source** (e.g., Fathom)

4. **Generate indexing config**

5. **Verify** the generated config:

   - Has `arrayPath` for list fetchers
   - No separate record types for enrichment tools
   - Clean syncOrder with only valid fetchers

6. **Check logs** for auto-repair messages:
   ```
   Auto-repair: Adding missing arrayPath
   Auto-repair: Removing invalid record type (enrichment-only tool)
   Auto-repair: Removing unused fetcher
   ```

## Example: Fathom Config (Before vs After)

### Before (Broken)

```json
{
  "fetchers": {
    "list_meetings": {
      "resultPath": "$.content[0].text"  // ❌ Missing arrayPath
    },
    "get_transcript": { ... },
    "get_summary": { ... }
  },
  "recordTypes": {
    "meeting": { ... },
    "transcript": {  // ❌ Invalid record type
      "fetcher": "get_transcript"
    },
    "summary": {  // ❌ Invalid record type
      "fetcher": "get_summary"
    }
  }
}
```

### After (Fixed)

```json
{
  "fetchers": {
    "list_meetings": {
      "resultPath": "$.content[0].text",
      "arrayPath": "$.items[*]" // ✅ Auto-added
    }
    // ✅ Unused fetchers removed
  },
  "recordTypes": {
    "meeting": {
      "fetcher": "list_meetings",
      "enrichments": [
        {
          "name": "transcript",
          "tool": "get_transcript", // ✅ Used as enrichment
          "paramMapping": { "recording_id": "$.recording_id" }
        },
        {
          "name": "summary",
          "tool": "get_summary", // ✅ Used as enrichment
          "paramMapping": { "recording_id": "$.recording_id" }
        }
      ]
    }
    // ✅ Invalid record types removed
  }
}
```

## Future Enhancements

1. **Smarter arrayPath Detection**: Handle nested arrays and complex structures
2. **Batch Validation**: Validate multiple configs at once
3. **Config Diff View**: Show before/after repairs in UI
4. **Repair Statistics**: Track which repairs are most common
5. **Custom Repair Rules**: Allow users to define custom validation/repair logic

## Related Documentation

- [Config Validation Improvements](./CONFIG_VALIDATION_IMPROVEMENTS.md)
- [Indexing Config Schema](../../packages/indexing-engine/src/types/config.ts)
- [Post-Validator Service](../../packages/server/src/services/indexing/config/config-post-validator.service.ts)
