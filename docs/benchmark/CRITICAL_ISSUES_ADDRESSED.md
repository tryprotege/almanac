# Critical Issues Identified & Addressed

This document lists all potential issues found during design review and how they're addressed in the plan.

## 🚨 Critical Issues (Would Break System)

### 1. Cross-Generation References

**Problem**: New data needs to reference old items (e.g., "Reopened Issue #47") but old issues are only in historical summary without IDs.

**Solution**: Added `referenceIndex` to metadata:

- Tracks last used IDs for all entity types
- Keeps "notable items" (last 50 significant issues/PRs) with IDs even when old
- Enables cross-generation references

**Implementation**: Section 3 of plan

---

### 2. ID Collision Risk

**Problem**: New GitHub issues might reuse IDs from previous generations (Issue #50 in gen_1, Issue #50 again in gen_2).

**Solution**: `idCounters` in reference index:

```json
"idCounters": {
  "githubIssues": 125,  // Next issue starts at 126
  "githubPRs": 98,
  "notionPages": 87
}
```

**Implementation**: Section 3 of plan

---

### 3. Active Items Staleness

**Problem**: Metadata says Issue #63 is "open" but it was closed in the latest generation. Stale state.

**Solution**: `synchronizeActiveItems()` function:

- After generating new data, check what was closed/merged
- Remove from activeItems
- Add new open items
- Keep metadata in sync with reality

**Implementation**: Section 4 of plan

---

### 4. Semantic Extraction at Scale

**Problem**: Extracting topics from 68 days of data (6,800+ messages) is slow and expensive (token limits, cost).

**Solution**: **Incremental extraction during generation** (to be added):

- Track topics as they're generated (in-memory counter)
- Only send topic summaries to LLM, not raw data
- Much faster and cheaper

**Status**: ⚠️ Needs to be added to plan

---

### 5. Historical Summary Degradation

**Problem**: Re-summarizing summaries loses information:

```
Gen 1: "Fixed matchmaking timeout by increasing to 15s..."
Gen 10: "Fixed matchmaking performance"
Gen 20: "Various improvements"  ❌ Lost detail!
```

**Solution**: **Hierarchical archiving** instead of re-summarization:

- Each generation gets ONE archive entry, never re-summarized
- Keep max 20 archives, merge oldest pairs when limit hit
- Preserves original detail

**Implementation**: Section 4 of plan

---

## ⚠️ Important Issues (Could Cause Problems)

### 6. Entity Evolution

**Problem**: Channels get archived, users leave, repos get deleted. How to track state changes?

**Solution**: Store entities with state:

```json
"slackChannels": [
  { "id": "C123", "name": "engineering", "archived": false },
  { "id": "C456", "name": "old-project", "archived": true, "archivedAt": "2025-02-15" }
]
```

**Status**: ⚠️ Needs to be added to plan

---

### 7. LLM Context Window Limits

**Problem**: Even with pruning, tiered context prompt could exceed token limits (10-20KB of text).

**Solution**: Smart truncation:

- If recent topics > 15, only show top 10 by mention count
- If prompt > 8000 tokens, truncate medium context, then historical
- Prioritize recent over historical

**Status**: ⚠️ Needs to be added to plan

---

### 8. Topic Reactivation

**Problem**: Dormant topic (60 days old, in historical summary) suddenly becomes active again.

**Solution**: When extracting topics, check if it's a reactivation:

```typescript
if (newTopic matches historicalTopic) {
  // Move from historical back to recent
  // Restore from archive with fresh mentions
}
```

**Status**: ⚠️ Needs to be added to plan

---

## 📋 Nice-to-Have Improvements

### 9. Merge/Query Utility

**Problem**: Users can't easily query "all data about Issue #47" across generations.

**Possible Solution**: Manifest file tracking what IDs are in which generation:

```json
"manifest.json": {
  "githubIssues": {
    "47": ["gen_1", "gen_2"],  // Issue #47 mentioned in gen_1 and gen_2
    "63": ["gen_2", "gen_3"]
  }
}
```

**Status**: ⏸️ Defer to future iteration

---

### 10. Backup/Recovery

**Problem**: If metadata.json corrupts, no way to rebuild.

**Possible Solution**:

- Keep metadata backups (metadata.json.backup)
- Provide rebuild utility that scans generation files

**Status**: ⏸️ Defer to future iteration

---

### 11. Validation

**Problem**: No validation of generated data structure before saving.

**Possible Solution**: JSON schema validation for each provider's data.

**Status**: ⏸️ Can add in Phase 8 (testing)

---

### 12. Concurrent Runs

**Problem**: Running generator twice simultaneously could corrupt metadata.

**Possible Solution**: File locking or atomic writes.

**Status**: ⏸️ Low priority (unlikely scenario)

---

### 13. Timezone Consistency

**Problem**: Running from different timezones could create date overlaps/gaps.

**Solution**: Always use UTC, normalize in `generateTimeline()`.

**Status**: ✅ Easy fix, should add to plan

---

## Summary

**Critical (Must Address)**: 5 issues

- ✅ Fixed: 3 (Cross-gen references, ID collisions, Active items sync)
- ✅ Fixed: 1 (Historical degradation)
- ⚠️ TODO: 1 (Incremental extraction)

**Important (Should Address)**: 3 issues

- ⚠️ TODO: All 3 (Entity evolution, Context limits, Topic reactivation)

**Nice-to-Have**: 5 issues

- ⏸️ Defer all to future iterations

## Recommended Next Steps

1. **Add incremental semantic extraction** to Section 6 of plan
2. **Add entity state management** to metadata structure
3. **Add LLM prompt truncation** logic to buildLLMContextFromMetadata
4. **Add topic reactivation** logic to extractSemanticContext
5. **Add UTC normalization** to dates.ts

After these additions, the plan will be complete and ready for implementation.

---

**Version**: 1.0
**Date**: 2025-12-15
