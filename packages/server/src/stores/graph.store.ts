import Cypher from "@neo4j/cypher-builder";
import { MemgraphNode, MemgraphRelationship } from "../types/index.js";
import { MemgraphConnection } from "../connections/memgraph.js";
import sleep from "../utils/sleep.js";
import logger from "../utils/logger.js";
import { sanitizeRelationshipType } from "../utils/cypher-escape.js";

/**
 * Generate Memgraph label from type
 * @example getNodeLabel("page") => "Page"
 */
export function getNodeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Orphaned entity details for logging
 */
export interface OrphanedEntityDetails {
  id: string;
  type: string;
  title: string;
}

/**
 * Orphaned relationship details for logging
 */
export interface OrphanedRelationshipDetails {
  sourceId: string;
  targetId: string;
  type: string;
  confidence?: number;
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
    const nodeVar = new Cypher.Node();

    const query = new Cypher.Merge(
      new Cypher.Pattern(nodeVar, {
        labels: [label],
        properties: { id: new Cypher.Param(node.id) },
      })
    ).set(
      [nodeVar.property("title"), new Cypher.Param(node.title)],
      [nodeVar.property("type"), new Cypher.Param(node.type)]
    );

    const { cypher, params } = query.build();
    await this.memgraph.executeQuery(cypher, params);
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
    const sourceNode = new Cypher.Node();
    const targetNode = new Cypher.Node();
    const rel = new Cypher.Relationship();

    const matchSource = new Cypher.Match(
      new Cypher.Pattern(sourceNode, {
        properties: { id: new Cypher.Param(relationship.sourceId) },
      })
    );

    const matchTarget = new Cypher.Match(
      new Cypher.Pattern(targetNode, {
        properties: { id: new Cypher.Param(relationship.targetId) },
      })
    );

    const mergeRel = new Cypher.Merge(
      new Cypher.Pattern(sourceNode)
        .related(rel, { type: relationship.type })
        .to(targetNode)
    ).set([
      rel.property("confidence"),
      new Cypher.Param(relationship.confidence),
    ]);

    const query = Cypher.utils.concat(matchSource, matchTarget, mergeRel);
    const { cypher, params } = query.build();
    await this.memgraph.executeQuery(cypher, params);
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
    const node = new Cypher.Node();

    const query = new Cypher.Match(new Cypher.Pattern(node))
      .where(Cypher.eq(node.property("id"), new Cypher.Param(id)))
      .return([Cypher.gt(Cypher.count(node), new Cypher.Literal(0)), "exists"]);

    const { cypher, params } = query.build();
    const results = await this.memgraph.executeQuery<{ exists: boolean }>(
      cypher,
      params
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
    const sourceNode = new Cypher.Node();
    const targetNode = new Cypher.Node();
    const rel = new Cypher.Relationship();

    const query = new Cypher.Match(
      new Cypher.Pattern(sourceNode).related(rel, { type }).to(targetNode)
    )
      .where(
        Cypher.and(
          Cypher.eq(sourceNode.property("id"), new Cypher.Param(sourceId)),
          Cypher.eq(targetNode.property("id"), new Cypher.Param(targetId))
        )
      )
      .return([Cypher.gt(Cypher.count(rel), new Cypher.Literal(0)), "exists"]);

    const { cypher, params } = query.build();
    const results = await this.memgraph.executeQuery<{ exists: boolean }>(
      cypher,
      params
    );

    return results[0]?.exists || false;
  }

  /**
   * Get a node by ID
   */
  async getNode(id: string): Promise<MemgraphNode | null> {
    const node = new Cypher.Node();

    const query = new Cypher.Match(new Cypher.Pattern(node))
      .where(Cypher.eq(node.property("id"), new Cypher.Param(id)))
      .return(
        [node.property("id"), "id"],
        [node.property("type"), "type"],
        [node.property("title"), "title"],
        [Cypher.labels(node), "labels"]
      );

    const { cypher, params } = query.build();
    const results = await this.memgraph.executeQuery<{
      id: string;
      type: string;
      title: string;
      labels: string[];
    }>(cypher, params);

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

    const node = new Cypher.Node();
    const rel = new Cypher.Relationship();

    const query = new Cypher.Match(
      new Cypher.Pattern(node).related(rel).to(new Cypher.Node())
    )
      .where(Cypher.in(node.property("id"), new Cypher.Param(nodeIds)))
      .return([node.property("id"), "nodeId"], [Cypher.count(rel), "degree"]);

    const { cypher, params } = query.build();
    const results = await this.memgraph.executeQuery<{
      nodeId: string;
      degree: number;
    }>(cypher, params);

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
    const node = new Cypher.Node();

    const query = new Cypher.Match(new Cypher.Pattern(node))
      .where(Cypher.eq(node.property("id"), new Cypher.Param(id)))
      .detachDelete(node);

    const { cypher, params } = query.build();
    await this.memgraph.executeQuery(cypher, params);
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
    const entityNode = new Cypher.Node();

    const query = new Cypher.Merge(
      new Cypher.Pattern(entityNode, {
        labels: ["Entity"],
        properties: { id: new Cypher.Param(entity.id) },
      })
    ).set(
      [entityNode.property("type"), new Cypher.Param(entity.type)],
      [entityNode.property("title"), new Cypher.Param(entity.title)],
      [entityNode.property("description"), new Cypher.Param(entity.description)]
    );

    const { cypher, params } = query.build();
    await this.memgraph.executeQuery(cypher, params);
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
   * Batch create or update multiple document nodes
   * Uses UNWIND for efficient batch processing - no write conflicts
   */
  async upsertDocumentNodes(
    documents: Array<{
      id: string;
      title: string;
      source: string;
    }>
  ): Promise<void> {
    if (documents.length === 0) return;

    const query = `
      UNWIND $documents AS doc
      MERGE (d:Document {id: doc.id})
      SET d.title = doc.title,
          d.source = doc.source
    `;

    await this.memgraph.executeQuery(query, { documents });
  }

  /**
   * Link an entity to a document using MENTIONED_IN relationship
   */
  async linkEntityToDocument(
    entityId: string,
    recordId: string,
    metadata?: { confidence?: number }
  ): Promise<void> {
    const entityNode = new Cypher.Node();
    const docNode = new Cypher.Node();
    const rel = new Cypher.Relationship();

    const matchEntity = new Cypher.Match(
      new Cypher.Pattern(entityNode, {
        labels: ["Entity"],
        properties: { id: new Cypher.Param(entityId) },
      })
    );

    const matchDoc = new Cypher.Match(
      new Cypher.Pattern(docNode, {
        properties: { id: new Cypher.Param(recordId) },
      })
    );

    const mergeRel = new Cypher.Merge(
      new Cypher.Pattern(entityNode)
        .related(rel, { type: "MENTIONED_IN" })
        .to(docNode)
    ).set(
      [rel.property("extractedAt"), Cypher.datetime()],
      [
        rel.property("confidence"),
        new Cypher.Param(metadata?.confidence || 1.0),
      ]
    );

    const query = Cypher.utils.concat(matchEntity, matchDoc, mergeRel);
    const { cypher, params } = query.build();
    await this.memgraph.executeQuery(cypher, params);
  }

  /**
   * Batch link multiple documents to relationships
   * Processes each link individually to catch and log specific errors
   * Auto-creates document nodes if they don't exist (MERGE)
   */
  async linkDocumentsToRelationshipsBatch(
    links: Array<{
      recordId: string;
      relationshipType: string;
      sourceEntityId: string;
      targetEntityId: string;
      confidence: number;
    }>
  ): Promise<void> {
    if (links.length === 0) return;

    // OLD BATCH CODE (commented out for debugging):
    // const query = `
    //   UNWIND $links AS link
    //   MATCH (source:Entity {id: link.sourceEntityId})
    //   MERGE (doc:Document {id: link.recordId})
    //   MERGE (doc)-[r:MENTIONS_REL]->(source)
    //   SET r.relationshipType = link.relationshipType,
    //       r.sourceEntityId = link.sourceEntityId,
    //       r.targetEntityId = link.targetEntityId,
    //       r.confidence = link.confidence,
    //       r.extractedAt = datetime()
    // `;
    // await this.memgraph.executeQuery(query, { links });

    // NEW: Process individually to catch specific errors
    let successCount = 0;
    let failureCount = 0;

    for (const link of links) {
      try {
        const query = `
          MATCH (source:Entity {id: $sourceEntityId})
          MERGE (doc:Document {id: $recordId})
          MERGE (doc)-[r:MENTIONS_REL]->(source)
          SET r.relationshipType = $relationshipType,
              r.sourceEntityId = $sourceEntityId,
              r.targetEntityId = $targetEntityId,
              r.confidence = $confidence,
              r.extractedAt = datetime()
          RETURN source.id AS sourceId
        `;

        const result = await this.memgraph.executeQuery<{ sourceId: string }>(
          query,
          {
            recordId: link.recordId,
            sourceEntityId: link.sourceEntityId,
            relationshipType: link.relationshipType,
            targetEntityId: link.targetEntityId,
            confidence: link.confidence,
          }
        );

        // Check if MATCH actually found the source entity
        if (result.length === 0) {
          failureCount++;
          logger.error({
            msg: "❌ MENTIONS_REL failed: Source entity does not exist in graph",
            recordId: link.recordId,
            relationshipType: link.relationshipType,
            sourceEntityId: link.sourceEntityId,
            targetEntityId: link.targetEntityId,
            confidence: link.confidence,
          });
        } else {
          successCount++;
        }
      } catch (err) {
        failureCount++;
        logger.error({
          msg: "❌ Failed to create MENTIONS_REL relationship (exception)",
          err,
          recordId: link.recordId,
          relationshipType: link.relationshipType,
          sourceEntityId: link.sourceEntityId,
          targetEntityId: link.targetEntityId,
          confidence: link.confidence,
        });
      }
    }

    if (failureCount > 0) {
      logger.warn({
        msg: `⚠️  Some MENTIONS_REL relationships failed to create`,
        successCount,
        failureCount,
        totalLinks: links.length,
      });
    } else {
      logger.info({
        msg: `✅ All MENTIONS_REL relationships created successfully`,
        successCount,
        totalLinks: links.length,
      });
    }
  }

  /**
   * Remove all entity mentions from a specific document
   * Returns the list of entity IDs that were unlinked
   */
  async unlinkAllEntitiesFromDocument(recordId: string): Promise<string[]> {
    const query = `
      MATCH (entity:Entity)-[r:MENTIONED_IN]->(doc {id: $recordId})
      WITH entity, r
      DELETE r
      RETURN entity.id AS entityId
    `;

    const results = await this.memgraph.executeQuery<{ entityId: string }>(
      query,
      { recordId }
    );

    return results.map((r) => r.entityId);
  }

  /**
   * Delete entities that have no relationships at all (truly orphaned entities)
   * Only deletes entities with NO relationships including MENTIONED_IN
   * Returns details of deleted entities for enhanced logging
   * Includes retry logic for Memgraph transaction conflicts
   */
  async deleteOrphanedEntities(
    maxRetries: number = 3
  ): Promise<{ count: number; entities: OrphanedEntityDetails[] }> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Always get full details of orphaned entities BEFORE deletion
        const detailsQuery = `
          MATCH (entity:Entity)
          WHERE NOT (entity)-[]-(  )
          RETURN entity.id AS id, entity.type AS type, entity.title AS title
          LIMIT 500
        `;

        const detailsResults = await this.memgraph.executeQuery<{
          id: string;
          type: string;
          title: string;
        }>(detailsQuery, {});

        const orphanedEntities: OrphanedEntityDetails[] = detailsResults.map(
          (e) => ({
            id: e.id,
            type: e.type,
            title: e.title,
          })
        );

        const finalCount = orphanedEntities.length;

        if (finalCount > 0) {
          // Delete the orphaned entities
          const deleteQuery = `
            MATCH (entity:Entity)
            WHERE NOT (entity)-[]-()
            DETACH DELETE entity
          `;
          await this.memgraph.executeQuery(deleteQuery, {});
        }

        return { count: finalCount, entities: orphanedEntities };
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
    return { count: 0, entities: [] };
  }

  /**
   * Get all entities mentioned in a document
   */
  async getDocumentEntities(recordId: string): Promise<
    Array<{
      id: string;
      type: string;
      title: string;
    }>
  > {
    const entityNode = new Cypher.Node();
    const docNode = new Cypher.Node();
    const rel = new Cypher.Relationship();

    const query = new Cypher.Match(
      new Cypher.Pattern(entityNode, { labels: ["Entity"] })
        .related(rel, { type: "MENTIONED_IN" })
        .to(docNode)
    )
      .where(Cypher.eq(docNode.property("id"), new Cypher.Param(recordId)))
      .return(
        [entityNode.property("id"), "id"],
        [entityNode.property("type"), "type"],
        [entityNode.property("title"), "title"]
      );

    const { cypher, params } = query.build();
    return this.memgraph.executeQuery(cypher, params);
  }

  /**
   * Create or update a semantic relationship (without document binding)
   */
  async upsertRelationship(relationship: {
    sourceId: string;
    targetId: string;
    type: string;
    confidence?: number;
  }): Promise<void> {
    const sourceNode = new Cypher.Node();
    const targetNode = new Cypher.Node();
    const rel = new Cypher.Relationship();

    const matchSource = new Cypher.Match(
      new Cypher.Pattern(sourceNode, {
        labels: ["Entity"],
        properties: { id: new Cypher.Param(relationship.sourceId) },
      })
    );

    const matchTarget = new Cypher.Match(
      new Cypher.Pattern(targetNode, {
        labels: ["Entity"],
        properties: { id: new Cypher.Param(relationship.targetId) },
      })
    );

    const mergeRel = new Cypher.Merge(
      new Cypher.Pattern(sourceNode)
        .related(rel, { type: relationship.type })
        .to(targetNode)
    ).set([
      rel.property("confidence"),
      new Cypher.Param(relationship.confidence || 1.0),
    ]);

    const query = Cypher.utils.concat(matchSource, matchTarget, mergeRel);
    const { cypher, params } = query.build();
    await this.memgraph.executeQuery(cypher, params);
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
      confidence?: number;
    }>
  ): Promise<void> {
    if (relationships.length === 0) return;

    // Group by relationship type (Cypher requirement for dynamic relationship types)
    const relsByType = new Map<string, typeof relationships>();
    let skippedCount = 0;

    for (const rel of relationships) {
      // Sanitize the relationship type before using it in the query
      const sanitizedType = sanitizeRelationshipType(rel.type);

      if (!sanitizedType) {
        // Invalid type - log warning and skip
        logger.warn({
          msg: "⚠️  Skipping relationship with invalid type during upsert",
          originalType: rel.type,
          sourceId: rel.sourceId,
          targetId: rel.targetId,
        });
        skippedCount++;
        continue;
      }

      const existing = relsByType.get(sanitizedType) || [];
      existing.push(rel);
      relsByType.set(sanitizedType, existing);
    }

    if (skippedCount > 0) {
      logger.warn({
        msg: `⚠️  Skipped ${skippedCount} relationships with invalid types`,
        skippedCount,
        totalRelationships: relationships.length,
      });
    }

    // Process each type sequentially (UNWIND within each type for batch efficiency)
    for (const [sanitizedType, typeRels] of relsByType.entries()) {
      try {
        const query = `
          UNWIND $rels AS rel
          MERGE (source:Entity {id: rel.sourceId})
          MERGE (target:Entity {id: rel.targetId})
          MERGE (source)-[r:${sanitizedType}]->(target)
          SET r.confidence = rel.confidence
        `;

        await this.memgraph.executeQuery(query, {
          rels: typeRels.map((r) => ({
            sourceId: r.sourceId,
            targetId: r.targetId,
            confidence: r.confidence ?? null,
          })),
        });
      } catch (err) {
        // Log the error but don't crash - other relationship types can still be processed
        logger.error({
          msg: "❌ Error upserting relationships",
          err,
          sanitizedType,
          relationshipCount: typeRels.length,
        });
      }
    }
  }

  /**
   * Delete a specific semantic relationship
   * Used by cleanup logic to remove orphaned relationships
   */
  async deleteRelationship(
    sourceId: string,
    type: string,
    targetId: string
  ): Promise<void> {
    const sanitizedType = sanitizeRelationshipType(type);

    if (!sanitizedType) {
      logger.warn({
        msg: "⚠️  Cannot delete relationship with invalid type",
        originalType: type,
        sourceId,
        targetId,
      });
      return;
    }

    const query = `
      MATCH (source:Entity {id: $sourceId})-[r:${sanitizedType}]->(target:Entity {id: $targetId})
      DELETE r
    `;

    await this.memgraph.executeQuery(query, { sourceId, targetId });
  }

  /**
   * Link a document to a relationship it mentions
   * @deprecated This method is deprecated and will be removed. Use RelationshipMentionStore instead.
   */
  async linkDocumentToRelationship(
    recordId: string,
    relationshipType: string,
    sourceEntityId: string,
    targetEntityId: string,
    metadata: { confidence: number }
  ): Promise<void> {
    const docNode = new Cypher.Node();
    const sourceNode = new Cypher.Node();
    const rel = new Cypher.Relationship();

    const matchDoc = new Cypher.Match(
      new Cypher.Pattern(docNode, {
        properties: { id: new Cypher.Param(recordId) },
      })
    );

    const matchSource = new Cypher.Match(
      new Cypher.Pattern(sourceNode, {
        labels: ["Entity"],
        properties: { id: new Cypher.Param(sourceEntityId) },
      })
    );

    const mergeRel = new Cypher.Merge(
      new Cypher.Pattern(docNode)
        .related(rel, { type: "MENTIONS_REL" })
        .to(sourceNode)
    ).set(
      [rel.property("relationshipType"), new Cypher.Param(relationshipType)],
      [rel.property("sourceEntityId"), new Cypher.Param(sourceEntityId)],
      [rel.property("targetEntityId"), new Cypher.Param(targetEntityId)],
      [rel.property("confidence"), new Cypher.Param(metadata.confidence)],
      [rel.property("extractedAt"), Cypher.datetime()]
    );

    const query = Cypher.utils.concat(matchDoc, matchSource, mergeRel);
    const { cypher, params } = query.build();
    await this.memgraph.executeQuery(cypher, params);
  }

  /**
   * Batch link multiple entities to documents
   * Uses UNWIND for efficient batch processing - no write conflicts
   */
  async linkEntitiesToDocuments(
    links: Array<{
      entityId: string;
      recordId: string;
      confidence?: number;
    }>
  ): Promise<void> {
    if (links.length === 0) return;

    const query = `
      UNWIND $links AS link
      MATCH (entity:Entity {id: link.entityId})
      MATCH (doc {id: link.recordId})
      MERGE (entity)-[r:MENTIONED_IN]->(doc)
      SET r.extractedAt = datetime(),
          r.confidence = link.confidence
    `;

    await this.memgraph.executeQuery(query, {
      links: links.map((l) => ({
        entityId: l.entityId,
        recordId: l.recordId,
        confidence: l.confidence || 1.0,
      })),
    });
  }

  /**
   * Remove all relationship mentions from a document
   */
  async unlinkRelationshipsFromDocument(recordId: string): Promise<number> {
    const query = `
      MATCH (doc {id: $recordId})-[r:MENTIONS_REL]->()
      WITH count(r) AS count
      MATCH (doc {id: $recordId})-[r:MENTIONS_REL]->()
      DELETE r
      RETURN count
    `;

    const results = await this.memgraph.executeQuery<{ count: number }>(query, {
      recordId,
    });

    const count = results[0]?.count || 0;
    return typeof count === "object" && count !== null && "toNumber" in count
      ? (count as any).toNumber()
      : count || 0;
  }

  /**
   * Delete semantic relationships that have no document mentions
   * Uses LEFT JOIN pattern to avoid complex nested EXISTS queries
   * Returns details of deleted relationships for enhanced logging
   */
  async deleteOrphanedRelationships(): Promise<{
    count: number;
    relationships: OrphanedRelationshipDetails[];
  }> {
    // Always get full details of orphaned relationships BEFORE deletion
    const detailsQuery = `
      MATCH (source:Entity)-[r]->(target:Entity)
      WHERE type(r) <> 'MENTIONED_IN' 
        AND type(r) <> 'MENTIONS_REL'
      OPTIONAL MATCH (doc)-[m:MENTIONS_REL]->(e)
      WHERE m.relationshipType = type(r)
        AND m.sourceEntityId = source.id
        AND m.targetEntityId = target.id
      WITH r, source, target, count(m) AS mentionCount
      WHERE mentionCount = 0
      RETURN source.id AS sourceId, target.id AS targetId, type(r) AS relType, r.confidence AS confidence
      LIMIT 500
    `;

    const detailsResults = await this.memgraph.executeQuery<{
      sourceId: string;
      targetId: string;
      relType: string;
      confidence: number;
    }>(detailsQuery, {});

    const orphanedRelationships: OrphanedRelationshipDetails[] =
      detailsResults.map((r) => ({
        sourceId: r.sourceId,
        targetId: r.targetId,
        type: r.relType,
        confidence: r.confidence,
      }));

    const finalCount = orphanedRelationships.length;

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

    return { count: finalCount, relationships: orphanedRelationships };
  }

  /**
   * Get all relationships mentioned in a document
   */
  async getDocumentRelationships(recordId: string): Promise<
    Array<{
      type: string;
      sourceId: string;
      targetId: string;
      confidence: number;
    }>
  > {
    const docNode = new Cypher.Node();
    const rel = new Cypher.Relationship();
    const targetNode = new Cypher.Node();

    const query = new Cypher.Match(
      new Cypher.Pattern(docNode)
        .related(rel, { type: "MENTIONS_REL" })
        .to(targetNode)
    )
      .where(Cypher.eq(docNode.property("id"), new Cypher.Param(recordId)))
      .return(
        [rel.property("relationshipType"), "type"],
        [rel.property("sourceEntityId"), "sourceId"],
        [rel.property("targetEntityId"), "targetId"],
        [rel.property("confidence"), "confidence"]
      );

    const { cypher, params } = query.build();
    return this.memgraph.executeQuery(cypher, params);
  }

  /**
   * Create document-to-document relationships (structural links from adapters)
   * These link Document nodes to each other (e.g., transcript to meeting)
   * Uses document IDs directly - no entity resolution needed
   */
  async createDocumentRelationships(
    relationships: Array<{
      sourceId: string;
      targetId: string;
      type: string;
      confidence: number;
    }>
  ): Promise<void> {
    if (relationships.length === 0) return;

    // Group by relationship type for efficient processing
    const relsByType = new Map<string, typeof relationships>();
    let skippedCount = 0;

    for (const rel of relationships) {
      const sanitizedType = sanitizeRelationshipType(rel.type);

      if (!sanitizedType) {
        logger.warn({
          msg: "⚠️  Skipping document relationship with invalid type",
          originalType: rel.type,
          sourceId: rel.sourceId,
          targetId: rel.targetId,
        });
        skippedCount++;
        continue;
      }

      const existing = relsByType.get(sanitizedType) || [];
      existing.push(rel);
      relsByType.set(sanitizedType, existing);
    }

    if (skippedCount > 0) {
      logger.warn({
        msg: `⚠️  Skipped ${skippedCount} document relationships with invalid types`,
        skippedCount,
        totalRelationships: relationships.length,
      });
    }

    // Process each type sequentially
    for (const [sanitizedType, typeRels] of relsByType.entries()) {
      try {
        const query = `
          UNWIND $rels AS rel
          MATCH (source {id: rel.sourceId})
          MATCH (target {id: rel.targetId})
          MERGE (source)-[r:${sanitizedType}]->(target)
          SET r.confidence = rel.confidence
        `;

        await this.memgraph.executeQuery(query, {
          rels: typeRels.map((r) => ({
            sourceId: r.sourceId,
            targetId: r.targetId,
            confidence: r.confidence ?? null,
          })),
        });

        logger.info({
          msg: `✅ Created ${typeRels.length} document relationships of type ${sanitizedType}`,
          relationshipType: sanitizedType,
          count: typeRels.length,
        });
      } catch (err) {
        logger.error({
          msg: "❌ Error creating document relationships",
          err,
          sanitizedType,
          relationshipCount: typeRels.length,
        });
      }
    }
  }

  /**
   * Delete all nodes and relationships
   */
  async deleteAll(): Promise<void> {
    const node = new Cypher.Node();

    const query = new Cypher.Match(new Cypher.Pattern(node)).detachDelete(node);

    const { cypher, params } = query.build();
    await this.memgraph.executeQuery(cypher, params);
  }

  /**
   * Get existing entity IDs from a list of IDs
   * Used to determine which entities are new vs existing during extraction
   */
  async getExistingEntityIds(entityIds: string[]): Promise<Set<string>> {
    if (entityIds.length === 0) return new Set();

    const query = `
      UNWIND $entityIds AS entityId
      MATCH (e:Entity {id: entityId})
      RETURN e.id AS id
    `;

    const results = await this.memgraph.executeQuery<{ id: string }>(query, {
      entityIds,
    });

    return new Set(results.map((r) => r.id));
  }

  /**
   * Get existing relationship keys from a list of source/target/type combinations
   * Used to determine which relationships are new vs existing during extraction
   */
  async getExistingRelationshipKeys(
    relationships: Array<{ sourceId: string; targetId: string; type: string }>
  ): Promise<Set<string>> {
    if (relationships.length === 0) return new Set();

    // Group by type for efficient querying
    const relsByType = new Map<
      string,
      Array<{ sourceId: string; targetId: string; originalType: string }>
    >();

    for (const rel of relationships) {
      // Sanitize the relationship type before using it in the query
      const sanitizedType = sanitizeRelationshipType(rel.type);

      if (!sanitizedType) {
        // Invalid type - log warning and skip
        logger.warn({
          msg: "⚠️  Skipping relationship with invalid type",
          originalType: rel.type,
          sourceId: rel.sourceId,
          targetId: rel.targetId,
        });
        continue;
      }

      // Track both sanitized and original types
      const existing = relsByType.get(sanitizedType) || [];
      existing.push({
        sourceId: rel.sourceId,
        targetId: rel.targetId,
        originalType: rel.type,
      });
      relsByType.set(sanitizedType, existing);
    }

    const existingKeys = new Set<string>();

    for (const [sanitizedType, rels] of relsByType.entries()) {
      try {
        const query = `
          UNWIND $rels AS rel
          MATCH (source:Entity {id: rel.sourceId})-[r:${sanitizedType}]->(target:Entity {id: rel.targetId})
          RETURN source.id AS sourceId, target.id AS targetId
        `;

        const results = await this.memgraph.executeQuery<{
          sourceId: string;
          targetId: string;
        }>(query, { rels });

        // Use the ORIGINAL type in the key, not the sanitized one
        for (const r of results) {
          // Find the original type for this relationship
          const relData = rels.find(
            (rel) => rel.sourceId === r.sourceId && rel.targetId === r.targetId
          );
          const originalType = relData?.originalType || sanitizedType;
          existingKeys.add(`${r.sourceId}|${originalType}|${r.targetId}`);
        }
      } catch (err) {
        // Log the error but don't crash - other relationship types can still be processed
        logger.error({
          msg: "❌ Error querying existing relationships",
          err,
          sanitizedType,
          relationshipCount: rels.length,
        });
      }
    }

    return existingKeys;
  }
}

// Export with old name for backwards compatibility during migration
export const MemgraphRepository = GraphStore;
