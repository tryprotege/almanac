import { MemgraphNode, MemgraphRelationship } from "../types/index.js";
import { MemgraphConnection } from "../connections/memgraph.js";
import sleep from "../utils/sleep.js";
import logger from "../utils/logger.js";

/**
 * Generate Memgraph label from type
 * @example getNodeLabel("page") => "Page"
 */
export function getNodeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Graph Store - Single-tenant Memgraph operations
 */
export class GraphStore {
  constructor(private memgraph: MemgraphConnection) {}

  /**
   * Create or update a node
   */
  async createNode(node: MemgraphNode): Promise<void> {
    const label = getNodeLabel(node.type);

    const query = `
      MERGE (n:${label} {id: $id})
      SET n.title = $title, n.type = $type
    `;

    await this.memgraph.executeQuery(query, {
      id: node.id,
      title: node.title,
      type: node.type,
    });
  }

  /**
   * Create multiple nodes in batch
   */
  async createNodes(nodes: MemgraphNode[]): Promise<void> {
    if (nodes.length === 0) return;

    // Group by type for more efficient batch operations
    const nodesByType = new Map<string, MemgraphNode[]>();
    for (const node of nodes) {
      const existing = nodesByType.get(node.type) || [];
      existing.push(node);
      nodesByType.set(node.type, existing);
    }

    // Create nodes for each type
    await Promise.all(
      Array.from(nodesByType.entries()).map(async ([type, typeNodes]) => {
        const label = getNodeLabel(type);

        const query = `
          UNWIND $nodes AS nodeData
          MERGE (n:${label} {id: nodeData.id})
          SET n.title = nodeData.title, n.type = nodeData.type
        `;

        await this.memgraph.executeQuery(query, {
          nodes: typeNodes.map((n) => ({
            id: n.id,
            title: n.title,
            type: n.type,
          })),
        });
      })
    );
  }

  /**
   * Create a relationship between two nodes
   */
  async createRelationship(relationship: MemgraphRelationship): Promise<void> {
    // Find nodes by ID (they might have different types/labels)
    const query = `
      MATCH (source {id: $sourceId})
      MATCH (target {id: $targetId})
      MERGE (source)-[r:${relationship.type}]->(target)
      SET r.confidence = $confidence
    `;

    await this.memgraph.executeQuery(query, {
      sourceId: relationship.sourceId,
      targetId: relationship.targetId,
      confidence: relationship.confidence,
    });
  }

  /**
   * Create multiple relationships in batch
   * Uses sequential processing to avoid transaction conflicts in Memgraph
   */
  async createRelationships(
    relationships: MemgraphRelationship[]
  ): Promise<void> {
    if (relationships.length === 0) return;

    // Group by relationship type
    const relsByType = new Map<string, MemgraphRelationship[]>();
    for (const rel of relationships) {
      const existing = relsByType.get(rel.type) || [];
      existing.push(rel);
      relsByType.set(rel.type, existing);
    }

    // Create relationships for each type sequentially to avoid transaction conflicts
    for (const [type, typeRels] of relsByType.entries()) {
      const query = `
        UNWIND $relationships AS relData
        MATCH (source {id: relData.sourceId})
        MATCH (target {id: relData.targetId})
        MERGE (source)-[r:${type}]->(target)
        SET r.confidence = relData.confidence
      `;

      await this.memgraph.executeQuery(query, {
        relationships: typeRels.map((r) => ({
          sourceId: r.sourceId,
          targetId: r.targetId,
          confidence: r.confidence,
        })),
      });
    }
  }

  /**
   * Check if a node exists by ID
   */
  async nodeExists(id: string): Promise<boolean> {
    const query = `
      MATCH (n {id: $id})
      RETURN count(n) > 0 AS exists
    `;

    const results = await this.memgraph.executeQuery<{ exists: boolean }>(
      query,
      { id }
    );

    return results[0]?.exists || false;
  }

  /**
   * Check if a relationship exists between two nodes
   */
  async relationshipExists(
    sourceId: string,
    type: string,
    targetId: string
  ): Promise<boolean> {
    const query = `
      MATCH (source {id: $sourceId})-[r:${type}]->(target {id: $targetId})
      RETURN count(r) > 0 AS exists
    `;

    const results = await this.memgraph.executeQuery<{ exists: boolean }>(
      query,
      { sourceId, targetId }
    );

    return results[0]?.exists || false;
  }

  /**
   * Get a node by ID
   */
  async getNode(id: string): Promise<MemgraphNode | null> {
    const query = `
      MATCH (n {id: $id})
      RETURN n.id AS id, n.type AS type, n.title AS title, labels(n) AS labels
    `;

    const results = await this.memgraph.executeQuery<{
      id: string;
      type: string;
      title: string;
      labels: string[];
    }>(query, { id });

    if (results.length === 0) return null;

    const result = results[0];
    return {
      label: result.labels[0],
      id: result.id,
      type: result.type,
      title: result.title,
    };
  }

  /**
   * Get relationship counts for multiple nodes in a single query
   * Much more efficient than calling getNodeRelationships for each node
   */
  async getNodeRelationshipCounts(
    nodeIds: string[]
  ): Promise<Map<string, number>> {
    if (nodeIds.length === 0) return new Map();

    const query = `
      MATCH (n)-[r]-()
      WHERE n.id IN $nodeIds
      RETURN n.id AS nodeId, count(r) AS degree
    `;

    const results = await this.memgraph.executeQuery<{
      nodeId: string;
      degree: number;
    }>(query, { nodeIds });

    const countMap = new Map<string, number>();
    results.forEach((r) => {
      // Handle both Neo4j Integer objects and regular numbers
      const degree =
        typeof r.degree === "object" &&
        r.degree !== null &&
        "toNumber" in r.degree
          ? (r.degree as any).toNumber()
          : r.degree || 0;
      countMap.set(r.nodeId, degree);
    });

    // Fill in zeros for nodes with no relationships
    nodeIds.forEach((id) => {
      if (!countMap.has(id)) {
        countMap.set(id, 0);
      }
    });

    return countMap;
  }

  /**
   * Get all relationships, optionally filtered by source
   * Used by relationship embedder during indexing
   */
  async getAllRelationships(options?: {
    source?: string;
    limit?: number;
    offset?: number;
  }): Promise<MemgraphRelationship[]> {
    let query = `
      MATCH (source)-[r]->(target)
      WHERE source.id IS NOT NULL AND target.id IS NOT NULL
    `;

    if (options?.source) {
      query += ` AND source.id STARTS WITH $source`;
    }

    query += `
      RETURN
        source.id AS sourceId,
        target.id AS targetId,
        type(r) AS relType,
        r.confidence AS confidence
    `;

    if (options?.offset) {
      query += ` SKIP ${options.offset}`;
    }

    if (options?.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    const results = await this.memgraph.executeQuery<{
      sourceId: string;
      targetId: string;
      relType: string;
      confidence: number;
    }>(query, { source: options?.source });

    return results.map((r) => ({
      sourceId: r.sourceId,
      targetId: r.targetId,
      type: r.relType,
      confidence: r.confidence || 1.0,
    }));
  }

  /**
   * Find all relationships for multiple nodes in a single query (BATCH)
   * Much more efficient than calling getNodeRelationships for each node
   * Returns a Map of nodeId -> relationships
   */
  async getNodeRelationshipsBatch(
    nodeIds: string[],
    options?: {
      direction?: "outgoing" | "incoming" | "both";
      relationshipTypes?: string[];
    }
  ): Promise<
    Map<
      string,
      Array<{
        relationship: MemgraphRelationship;
        relatedNode: MemgraphNode;
      }>
    >
  > {
    if (nodeIds.length === 0) return new Map();

    const direction = options?.direction || "both";
    const types = options?.relationshipTypes || [];

    let relationshipPattern = "";
    if (direction === "outgoing") {
      relationshipPattern =
        types.length > 0 ? `-[r:${types.join("|")}]->` : "-[r]->";
    } else if (direction === "incoming") {
      relationshipPattern =
        types.length > 0 ? `<-[r:${types.join("|")}]-` : "<-[r]-";
    } else {
      relationshipPattern =
        types.length > 0 ? `-[r:${types.join("|")}]-` : "-[r]-";
    }

    const query = `
      UNWIND $nodeIds AS nodeId
      MATCH (n {id: nodeId})${relationshipPattern}(related)
      RETURN 
        nodeId,
        n.id AS sourceId,
        related.id AS targetId,
        type(r) AS relType,
        r.confidence AS confidence,
        related.title AS relatedTitle,
        related.type AS relatedType,
        labels(related) AS relatedLabels
    `;

    const results = await this.memgraph.executeQuery<{
      nodeId: string;
      sourceId: string;
      targetId: string;
      relType: string;
      confidence: number;
      relatedTitle: string;
      relatedType: string;
      relatedLabels: string[];
    }>(query, { nodeIds });

    // Group by nodeId
    const relMap = new Map<
      string,
      Array<{
        relationship: MemgraphRelationship;
        relatedNode: MemgraphNode;
      }>
    >();

    // Initialize empty arrays for all nodeIds
    nodeIds.forEach((id) => relMap.set(id, []));

    // Populate with results
    results.forEach((r) => {
      const existing = relMap.get(r.nodeId) || [];
      existing.push({
        relationship: {
          sourceId: r.sourceId,
          targetId: r.targetId,
          type: r.relType,
          confidence: r.confidence,
        },
        relatedNode: {
          label: r.relatedLabels[0],
          id: r.targetId,
          type: r.relatedType,
          title: r.relatedTitle,
        },
      });
      relMap.set(r.nodeId, existing);
    });

    return relMap;
  }

  /**
   * Find all relationships for a node
   */
  async getNodeRelationships(
    nodeId: string,
    options?: {
      direction?: "outgoing" | "incoming" | "both";
      relationshipTypes?: string[];
    }
  ): Promise<
    Array<{
      relationship: MemgraphRelationship;
      relatedNode: MemgraphNode;
    }>
  > {
    const direction = options?.direction || "both";
    const types = options?.relationshipTypes || [];

    let relationshipPattern = "";
    if (direction === "outgoing") {
      relationshipPattern =
        types.length > 0 ? `-[r:${types.join("|")}]->` : "-[r]->";
    } else if (direction === "incoming") {
      relationshipPattern =
        types.length > 0 ? `<-[r:${types.join("|")}]-` : "<-[r]-";
    } else {
      relationshipPattern =
        types.length > 0 ? `-[r:${types.join("|")}]-` : "-[r]-";
    }

    const query = `
      MATCH (n {id: $nodeId})${relationshipPattern}(related)
      RETURN 
        n.id AS sourceId,
        related.id AS targetId,
        type(r) AS relType,
        r.confidence AS confidence,
        related.title AS relatedTitle,
        related.type AS relatedType,
        labels(related) AS relatedLabels
    `;

    const results = await this.memgraph.executeQuery<{
      sourceId: string;
      targetId: string;
      relType: string;
      confidence: number;
      relatedTitle: string;
      relatedType: string;
      relatedLabels: string[];
    }>(query, { nodeId });

    return results.map((r) => ({
      relationship: {
        sourceId: r.sourceId,
        targetId: r.targetId,
        type: r.relType,
        confidence: r.confidence,
      },
      relatedNode: {
        label: r.relatedLabels[0],
        id: r.targetId,
        type: r.relatedType,
        title: r.relatedTitle,
      },
    }));
  }

  /**
   * Find paths between two nodes
   */
  async findPaths(
    sourceId: string,
    targetId: string,
    options?: {
      maxDepth?: number;
    }
  ): Promise<
    Array<{
      nodes: MemgraphNode[];
      relationships: MemgraphRelationship[];
    }>
  > {
    const maxDepth = options?.maxDepth || 5;

    const query = `
      MATCH path = (source {id: $sourceId})-[*1..${maxDepth}]-(target {id: $targetId})
      RETURN nodes(path) AS nodes, relationships(path) AS relationships
      LIMIT 10
    `;

    const results = await this.memgraph.executeQuery<{
      nodes: Array<{ id: string; title: string; type: string }>;
      relationships: Array<{
        type: string;
        properties: {
          confidence: number;
        };
      }>;
    }>(query, { sourceId, targetId });

    return results.map((r) => ({
      nodes: r.nodes.map((n) => ({
        label: getNodeLabel(n.type),
        id: n.id,
        type: n.type,
        title: n.title,
      })),
      relationships: r.relationships.map((rel, idx) => ({
        sourceId: r.nodes[idx].id,
        targetId: r.nodes[idx + 1].id,
        type: rel.type,
        confidence: rel.properties.confidence,
      })),
    }));
  }

  /**
   * Get all graph data with pagination
   */
  async getAllGraphData(options?: {
    limit?: number;
    offset?: number;
    nodeTypes?: string[];
    relationshipTypes?: string[];
  }): Promise<{
    nodes: MemgraphNode[];
    relationships: MemgraphRelationship[];
    totalNodes: number;
    totalRelationships: number;
  }> {
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;
    const nodeTypes = options?.nodeTypes || [];
    const relationshipTypes = options?.relationshipTypes || [];

    // Build node query with optional type filter
    let nodeQuery = "MATCH (n)";
    if (nodeTypes.length > 0) {
      const labels = nodeTypes.map((type) => getNodeLabel(type)).join("|");
      nodeQuery = `MATCH (n:${labels})`;
    }
    nodeQuery += `
      RETURN n.id AS id, n.type AS type, n.title AS title, labels(n) AS labels
      SKIP ${offset} LIMIT ${limit}
    `;

    // Get total counts
    let countNodeQuery = "MATCH (n)";
    if (nodeTypes.length > 0) {
      const labels = nodeTypes.map((type) => getNodeLabel(type)).join("|");
      countNodeQuery = `MATCH (n:${labels})`;
    }
    countNodeQuery += " RETURN count(n) AS count";

    let countRelQuery = "MATCH ()-[r]-()";
    if (relationshipTypes.length > 0) {
      countRelQuery = `MATCH ()-[r:${relationshipTypes.join("|")}]-()`;
    }
    countRelQuery += " RETURN count(r) AS count";

    // Execute node query first
    const [nodeResults, nodeCountResults, relCountResults] = await Promise.all([
      this.memgraph.executeQuery<{
        id: string;
        type: string;
        title: string;
        labels: string[];
      }>(nodeQuery, {}),
      this.memgraph.executeQuery<{ count: number }>(countNodeQuery, {}),
      this.memgraph.executeQuery<{ count: number }>(countRelQuery, {}),
    ]);

    const nodes: MemgraphNode[] = nodeResults.map((r) => ({
      label: r.labels[0],
      id: r.id,
      type: r.type,
      title: r.title,
    }));

    // Get node IDs for filtering relationships
    const nodeIds = nodes.map((n) => n.id);

    // Build relationship query that only includes relationships between fetched nodes
    let relQuery = "";
    if (nodeIds.length === 0) {
      // No nodes, no relationships
      return {
        nodes,
        relationships: [],
        totalNodes: nodeCountResults[0]?.count || 0,
        totalRelationships: relCountResults[0]?.count || 0,
      };
    }

    // Query for relationships where both source and target are in our node set
    if (relationshipTypes.length > 0) {
      relQuery = `
        MATCH (source)-[r:${relationshipTypes.join("|")}]->(target)
        WHERE source.id IN $nodeIds AND target.id IN $nodeIds
        RETURN
          source.id AS sourceId,
          target.id AS targetId,
          type(r) AS relType,
          r.confidence AS confidence
      `;
    } else {
      relQuery = `
        MATCH (source)-[r]->(target)
        WHERE source.id IN $nodeIds AND target.id IN $nodeIds
        RETURN
          source.id AS sourceId,
          target.id AS targetId,
          type(r) AS relType,
          r.confidence AS confidence
      `;
    }

    const relResults = await this.memgraph.executeQuery<{
      sourceId: string;
      targetId: string;
      relType: string;
      confidence: number;
    }>(relQuery, { nodeIds });

    const relationships: MemgraphRelationship[] = relResults.map((r) => ({
      sourceId: r.sourceId,
      targetId: r.targetId,
      type: r.relType,
      confidence: r.confidence,
    }));

    return {
      nodes,
      relationships,
      totalNodes: nodeCountResults[0]?.count || 0,
      totalRelationships: relCountResults[0]?.count || 0,
    };
  }

  /**
   * Delete a node and all its relationships
   */
  async deleteNode(id: string): Promise<void> {
    const query = `
      MATCH (n {id: $id})
      DETACH DELETE n
    `;

    await this.memgraph.executeQuery(query, { id });
  }

  /**
   * Delete all entities extracted from a specific record
   * Entities have IDs like: {recordId}_{entityName}
   * Returns the number of nodes deleted
   * @deprecated Use unlinkAllEntitiesFromDocument + deleteOrphanedEntities instead
   */
  async deleteRecordEntities(recordId: string): Promise<number> {
    const query = `
      MATCH (n)
      WHERE n.id STARTS WITH $prefix
      WITH n, count(n) AS nodeCount
      DETACH DELETE n
      RETURN nodeCount
    `;

    const results = await this.memgraph.executeQuery<{ nodeCount: number }>(
      query,
      { prefix: `${recordId}_` }
    );

    // Handle both Neo4j Integer objects and regular numbers
    const count = results[0]?.nodeCount || 0;
    return typeof count === "object" && count !== null && "toNumber" in count
      ? (count as any).toNumber()
      : count || 0;
  }

  /**
   * Create or update an entity node (without document binding)
   */
  async upsertEntityNode(entity: {
    id: string;
    type: string;
    title: string;
    description?: string;
  }): Promise<void> {
    const query = `
      MERGE (e:Entity {id: $id})
      SET e.type = $type,
          e.title = $title,
          e.description = $description
    `;
    await this.memgraph.executeQuery(query, entity);
  }

  /**
   * Batch create or update multiple entity nodes
   * Uses UNWIND for efficient batch processing - no write conflicts
   */
  async upsertEntityNodes(
    entities: Array<{
      id: string;
      type: string;
      title: string;
      description?: string;
    }>
  ): Promise<void> {
    if (entities.length === 0) return;

    const query = `
      UNWIND $entities AS entity
      MERGE (e:Entity {id: entity.id})
      SET e.type = entity.type,
          e.title = entity.title,
          e.description = COALESCE(entity.description, e.description)
    `;

    await this.memgraph.executeQuery(query, { entities });
  }

  /**
   * Link an entity to a document using MENTIONED_IN relationship
   */
  async linkEntityToDocument(
    entityId: string,
    documentId: string,
    metadata?: { confidence?: number }
  ): Promise<void> {
    const query = `
      MATCH (entity:Entity {id: $entityId})
      MATCH (doc {id: $documentId})
      MERGE (entity)-[r:MENTIONED_IN]->(doc)
      SET r.extractedAt = datetime(),
          r.confidence = $confidence
    `;
    await this.memgraph.executeQuery(query, {
      entityId,
      documentId,
      confidence: metadata?.confidence || 1.0,
    });
  }

  /**
   * Batch link multiple entities to documents
   * Uses UNWIND for efficient batch processing - no write conflicts
   */
  async linkEntitiesToDocuments(
    links: Array<{
      entityId: string;
      documentId: string;
      confidence?: number;
    }>
  ): Promise<void> {
    if (links.length === 0) return;

    const query = `
      UNWIND $links AS link
      MATCH (entity:Entity {id: link.entityId})
      MATCH (doc {id: link.documentId})
      MERGE (entity)-[r:MENTIONED_IN]->(doc)
      SET r.extractedAt = datetime(),
          r.confidence = link.confidence
    `;

    await this.memgraph.executeQuery(query, {
      links: links.map((l) => ({
        entityId: l.entityId,
        documentId: l.documentId,
        confidence: l.confidence || 1.0,
      })),
    });
  }

  /**
   * Remove all entity mentions from a specific document
   * Returns the list of entity IDs that were unlinked
   */
  async unlinkAllEntitiesFromDocument(documentId: string): Promise<string[]> {
    const query = `
      MATCH (entity:Entity)-[r:MENTIONED_IN]->(doc {id: $documentId})
      WITH entity, r
      DELETE r
      RETURN entity.id AS entityId
    `;

    const results = await this.memgraph.executeQuery<{ entityId: string }>(
      query,
      { documentId }
    );

    return results.map((r) => r.entityId);
  }

  /**
   * Delete entities that have no relationships at all (truly orphaned entities)
   * Returns count of deleted entities
   * Includes retry logic for Memgraph transaction conflicts
   */
  async deleteOrphanedEntities(maxRetries: number = 3): Promise<number> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // First get the count
        // Check for entities with NO relationships in any direction
        const countQuery = `
          MATCH (entity:Entity)
          WHERE NOT (entity)-[]-()
          RETURN count(entity) AS count
        `;

        const countResults = await this.memgraph.executeQuery<{
          count: number;
        }>(countQuery, {});
        const count = countResults[0]?.count || 0;
        const finalCount =
          typeof count === "object" && count !== null && "toNumber" in count
            ? (count as any).toNumber()
            : count || 0;

        // Then delete the orphaned entities
        if (finalCount > 0) {
          const deleteQuery = `
            MATCH (entity:Entity)
            WHERE NOT (entity)-[]-()
            DETACH DELETE entity
          `;
          await this.memgraph.executeQuery(deleteQuery, {});
        }

        return finalCount;
      } catch (err: any) {
        // Check if it's a retriable Memgraph transaction conflict
        const isTransientError =
          err.code?.includes("TransientError") ||
          err.retriable === true ||
          err.retryable === true;

        if (isTransientError && attempt < maxRetries) {
          const delayMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
          logger.warn(
            `⚠️  Memgraph transaction conflict in deleteOrphanedEntities, retrying in ${delayMs}ms (attempt ${
              attempt + 1
            }/${maxRetries})`
          );
          await sleep(delayMs);
        } else {
          // Not retriable or max retries reached
          logger.error(
            { err, attempt, maxRetries },
            `❌ Failed to delete orphaned entities after ${attempt} attempts`
          );
          throw err;
        }
      }
    }

    // Should never reach here
    return 0;
  }

  /**
   * Get all entities mentioned in a document
   */
  async getDocumentEntities(documentId: string): Promise<
    Array<{
      id: string;
      type: string;
      title: string;
    }>
  > {
    const query = `
      MATCH (entity:Entity)-[:MENTIONED_IN]->(doc {id: $documentId})
      RETURN entity.id AS id, entity.type AS type, entity.title AS title
    `;

    return this.memgraph.executeQuery(query, { documentId });
  }

  /**
   * Create or update a semantic relationship (without document binding)
   */
  async upsertRelationship(relationship: {
    sourceId: string;
    targetId: string;
    type: string;
  }): Promise<void> {
    const query = `
      MATCH (source:Entity {id: $sourceId})
      MATCH (target:Entity {id: $targetId})
      MERGE (source)-[r:${relationship.type}]->(target)
    `;
    await this.memgraph.executeQuery(query, {
      sourceId: relationship.sourceId,
      targetId: relationship.targetId,
    });
  }

  /**
   * Batch create or update multiple semantic relationships
   * Uses UNWIND for efficient batch processing - no write conflicts
   * Groups by relationship type to handle dynamic relationship types in Cypher
   */
  async upsertRelationshipsBatch(
    relationships: Array<{
      sourceId: string;
      targetId: string;
      type: string;
    }>
  ): Promise<void> {
    if (relationships.length === 0) return;

    // Group by relationship type (Cypher requirement for dynamic relationship types)
    const relsByType = new Map<string, typeof relationships>();
    for (const rel of relationships) {
      const existing = relsByType.get(rel.type) || [];
      existing.push(rel);
      relsByType.set(rel.type, existing);
    }

    // Process each type sequentially (UNWIND within each type for batch efficiency)
    for (const [type, typeRels] of relsByType.entries()) {
      const query = `
        UNWIND $rels AS rel
        MATCH (source:Entity {id: rel.sourceId})
        MATCH (target:Entity {id: rel.targetId})
        MERGE (source)-[r:${type}]->(target)
      `;

      await this.memgraph.executeQuery(query, {
        rels: typeRels.map((r) => ({
          sourceId: r.sourceId,
          targetId: r.targetId,
        })),
      });
    }
  }

  /**
   * Link a document to a relationship it mentions
   */
  async linkDocumentToRelationship(
    documentId: string,
    relationshipType: string,
    sourceEntityId: string,
    targetEntityId: string,
    metadata: { confidence: number }
  ): Promise<void> {
    const query = `
      MATCH (doc {id: $documentId})
      MATCH (source:Entity {id: $sourceEntityId})
      MERGE (doc)-[r:MENTIONS_REL]->(source)
      SET r.relationshipType = $relationshipType,
          r.sourceEntityId = $sourceEntityId,
          r.targetEntityId = $targetEntityId,
          r.confidence = $confidence,
          r.extractedAt = datetime()
    `;

    await this.memgraph.executeQuery(query, {
      documentId,
      relationshipType,
      sourceEntityId,
      targetEntityId,
      confidence: metadata.confidence,
    });
  }

  /**
   * Batch link multiple documents to relationships
   * Uses UNWIND for efficient batch processing - no write conflicts
   */
  async linkDocumentsToRelationshipsBatch(
    links: Array<{
      documentId: string;
      relationshipType: string;
      sourceEntityId: string;
      targetEntityId: string;
      confidence: number;
    }>
  ): Promise<void> {
    if (links.length === 0) return;

    const query = `
      UNWIND $links AS link
      MATCH (doc {id: link.documentId})
      MATCH (source:Entity {id: link.sourceEntityId})
      MERGE (doc)-[r:MENTIONS_REL]->(source)
      SET r.relationshipType = link.relationshipType,
          r.sourceEntityId = link.sourceEntityId,
          r.targetEntityId = link.targetEntityId,
          r.confidence = link.confidence,
          r.extractedAt = datetime()
    `;

    await this.memgraph.executeQuery(query, { links });
  }

  /**
   * Remove all relationship mentions from a document
   */
  async unlinkRelationshipsFromDocument(documentId: string): Promise<number> {
    const query = `
      MATCH (doc {id: $documentId})-[r:MENTIONS_REL]->()
      WITH count(r) AS count
      MATCH (doc {id: $documentId})-[r:MENTIONS_REL]->()
      DELETE r
      RETURN count
    `;

    const results = await this.memgraph.executeQuery<{ count: number }>(query, {
      documentId,
    });

    const count = results[0]?.count || 0;
    return typeof count === "object" && count !== null && "toNumber" in count
      ? (count as any).toNumber()
      : count || 0;
  }

  /**
   * Delete semantic relationships that have no document mentions
   * Uses LEFT JOIN pattern to avoid complex nested EXISTS queries
   */
  async deleteOrphanedRelationships(): Promise<number> {
    // First, count how many will be deleted
    const countQuery = `
      MATCH (source:Entity)-[r]->(target:Entity)
      WHERE type(r) <> 'MENTIONED_IN' 
        AND type(r) <> 'MENTIONS_REL'
      OPTIONAL MATCH (doc)-[m:MENTIONS_REL]->(e)
      WHERE m.relationshipType = type(r)
        AND m.sourceEntityId = source.id
        AND m.targetEntityId = target.id
      WITH r, count(m) AS mentionCount
      WHERE mentionCount = 0
      RETURN count(r) AS count
    `;

    const countResults = await this.memgraph.executeQuery<{ count: number }>(
      countQuery,
      {}
    );
    const count = countResults[0]?.count || 0;
    const finalCount =
      typeof count === "object" && count !== null && "toNumber" in count
        ? (count as any).toNumber()
        : count || 0;

    // Then delete if there are any orphans
    if (finalCount > 0) {
      const deleteQuery = `
        MATCH (source:Entity)-[r]->(target:Entity)
        WHERE type(r) <> 'MENTIONED_IN' 
          AND type(r) <> 'MENTIONS_REL'
        OPTIONAL MATCH (doc)-[m:MENTIONS_REL]->(e)
        WHERE m.relationshipType = type(r)
          AND m.sourceEntityId = source.id
          AND m.targetEntityId = target.id
        WITH r, count(m) AS mentionCount
        WHERE mentionCount = 0
        DELETE r
      `;

      await this.memgraph.executeQuery(deleteQuery, {});
    }

    return finalCount;
  }

  /**
   * Get all relationships mentioned in a document
   */
  async getDocumentRelationships(documentId: string): Promise<
    Array<{
      type: string;
      sourceId: string;
      targetId: string;
      confidence: number;
    }>
  > {
    const query = `
      MATCH (doc {id: $documentId})-[r:MENTIONS_REL]->()
      RETURN r.relationshipType AS type,
             r.sourceEntityId AS sourceId,
             r.targetEntityId AS targetId,
             r.confidence AS confidence
    `;

    return this.memgraph.executeQuery(query, { documentId });
  }

  /**
   * Delete all nodes and relationships
   */
  async deleteAll(): Promise<void> {
    const query = `
      MATCH (n)
      DETACH DELETE n
    `;

    await this.memgraph.executeQuery(query, {});
  }
}

// Export with old name for backwards compatibility during migration
export const MemgraphRepository = GraphStore;
