import { MemgraphNode, MemgraphRelationship } from "../types/index.js";
import { MemgraphConnection } from "../connections/memgraph.js";

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
      SET r.confidence = $confidence,
          r.extractedBy = $extractedBy
    `;

    await this.memgraph.executeQuery(query, {
      sourceId: relationship.sourceId,
      targetId: relationship.targetId,
      confidence: relationship.confidence,
      extractedBy: relationship.extractedBy,
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
        SET r.confidence = relData.confidence,
            r.extractedBy = relData.extractedBy
      `;

      await this.memgraph.executeQuery(query, {
        relationships: typeRels.map((r) => ({
          sourceId: r.sourceId,
          targetId: r.targetId,
          confidence: r.confidence,
          extractedBy: r.extractedBy,
        })),
      });
    }
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
        r.extractedBy AS extractedBy,
        related.title AS relatedTitle,
        related.type AS relatedType,
        labels(related) AS relatedLabels
    `;

    const results = await this.memgraph.executeQuery<{
      sourceId: string;
      targetId: string;
      relType: string;
      confidence: number;
      extractedBy: string;
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
        extractedBy: r.extractedBy as "explicit" | "llm" | "heuristic",
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
          extractedBy: string;
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
        extractedBy: rel.properties.extractedBy as
          | "explicit"
          | "llm"
          | "heuristic",
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
          r.confidence AS confidence,
          r.extractedBy AS extractedBy
      `;
    } else {
      relQuery = `
        MATCH (source)-[r]->(target)
        WHERE source.id IN $nodeIds AND target.id IN $nodeIds
        RETURN
          source.id AS sourceId,
          target.id AS targetId,
          type(r) AS relType,
          r.confidence AS confidence,
          r.extractedBy AS extractedBy
      `;
    }

    const relResults = await this.memgraph.executeQuery<{
      sourceId: string;
      targetId: string;
      relType: string;
      confidence: number;
      extractedBy: string;
    }>(relQuery, { nodeIds });

    const relationships: MemgraphRelationship[] = relResults.map((r) => ({
      sourceId: r.sourceId,
      targetId: r.targetId,
      type: r.relType,
      confidence: r.confidence,
      extractedBy: r.extractedBy as "explicit" | "llm" | "heuristic",
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
