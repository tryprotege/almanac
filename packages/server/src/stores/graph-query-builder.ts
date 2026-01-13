/**
 * Cypher Query Builder Utilities
 * Helper functions for building type-safe Cypher queries
 */

import Cypher from '@neo4j/cypher-builder';

/**
 * Build a dynamic label for a node based on type
 */
export function getNodeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Create a node pattern with optional label
 */
export function createNodePattern(
  node: Cypher.Node,
  options?: { labels?: string[] },
): Cypher.Pattern {
  return new Cypher.Pattern(node, options);
}

// Note: Complex helper functions removed in favor of direct inline migrations
// The cypher-builder API has constraints that make generic helpers difficult

/**
 * Build relationship pattern with dynamic direction
 */
export function buildRelationshipPattern(
  sourceNode: Cypher.Node,
  targetNode: Cypher.Node,
  options?: {
    direction?: 'outgoing' | 'incoming' | 'both';
    relationshipTypes?: string[];
  },
): Cypher.Pattern {
  const direction = options?.direction || 'both';
  const types = options?.relationshipTypes || [];
  const rel = new Cypher.Relationship();

  const pattern = new Cypher.Pattern(sourceNode);

  if (direction === 'outgoing') {
    return types.length > 0
      ? pattern.related(rel, { type: types.join('|') }).to(targetNode)
      : pattern.related(rel).to(targetNode);
  } else if (direction === 'incoming') {
    return types.length > 0
      ? pattern.related(rel, { type: types.join('|'), direction: 'left' }).to(targetNode)
      : pattern.related(rel, { direction: 'left' }).to(targetNode);
  } else {
    // both directions
    return types.length > 0
      ? pattern.related(rel, { type: types.join('|') }).to(targetNode)
      : pattern.related(rel).to(targetNode);
  }
}

/**
 * Build count comparison predicate
 */
export function buildCountComparison(
  expr: Cypher.Expr,
  operator: '>' | '>=' | '<' | '<=' | '=' | '<>',
  value: number,
): Cypher.Predicate {
  const countExpr = Cypher.count(expr);
  const valueParam = new Cypher.Literal(value);

  switch (operator) {
    case '>':
      return Cypher.gt(countExpr, valueParam);
    case '>=':
      return Cypher.gte(countExpr, valueParam);
    case '<':
      return Cypher.lt(countExpr, valueParam);
    case '<=':
      return Cypher.lte(countExpr, valueParam);
    case '=':
      return Cypher.eq(countExpr, valueParam);
    case '<>':
      return Cypher.neq(countExpr, valueParam);
    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}
