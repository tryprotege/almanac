import { Request, Response, Router } from "express";
import { getSchema } from "../../stores/index.js";

const schemaRouter: Router = Router();

// GET /api/schema - Get full schema with entity and relationship types
schemaRouter.get("/schema", async (_req: Request, res: Response) => {
  try {
    const schema = await getSchema();

    if (!schema) {
      res.status(404).json({
        success: false,
        error: "Schema not found",
      });
      return;
    }

    res.json({
      success: true,
      data: {
        version: schema.version,
        entityTypes: schema.entityTypes,
        relationshipTypes: schema.relationshipTypes,
        lastLearnedAt: schema.lastLearnedAt,
        learnedFromSampleSize: schema.learnedFromSampleSize,
        persona: schema.persona,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export { schemaRouter };
