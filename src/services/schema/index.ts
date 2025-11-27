// Schema learning functions
export {
  learnSchema,
  runSchemaLearning,
  fetchRecords,
  extractEntityTypesFromRecords,
  extractRelationshipTypesFromRecords,
  mergeEntityTypes,
  mergeRelationshipTypes,
  createEmptyResult,
  sleep,
} from "./schema-learning.service.js";

// Schema extraction functions
export {
  extractEntitiesFromContent,
  extractRelationshipsFromContent,
  extractGraphRelationships,
} from "./schema-extraction.js";

// Schema trigger functions
export { shouldRunSchemaLearning } from "./schema-trigger.js";

// Types
export type {
  SchemaLearningOptions,
  SchemaLearningResult,
  RunSchemaLearningResult,
} from "./schema-learning.service.js";
