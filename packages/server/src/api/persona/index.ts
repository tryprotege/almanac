import { getPersona, updatePersona } from "../../stores/index.js";
import { Request, Response, Router } from "express";

const personaRouter: Router = Router();

// GET /api/schema/persona - Get current persona
personaRouter.get("/persona", async (_req: Request, res: Response) => {
  try {
    const persona = await getPersona();

    res.json({
      success: true,
      data: {
        persona: persona || "",
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// PUT /api/schema/persona - Update persona
personaRouter.put("/persona", async (req: Request, res: Response) => {
  try {
    const { persona } = req.body;

    if (typeof persona !== "string") {
      res.status(400).json({
        success: false,
        error: "Persona must be a string",
      });
      return;
    }

    if (persona.length > 1000) {
      res.status(400).json({
        success: false,
        error: "Persona must be 1000 characters or less",
      });
      return;
    }

    const updatedSchema = await updatePersona(persona);

    if (!updatedSchema) {
      res.status(500).json({
        success: false,
        error: "Failed to update persona",
      });
      return;
    }

    res.json({
      success: true,
      data: {
        persona: updatedSchema.persona,
        updatedAt: updatedSchema.updatedAt,
      },
      message: "Persona updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// DELETE /api/schema/persona - Clear persona
personaRouter.delete("/persona", async (_req: Request, res: Response) => {
  try {
    const updatedSchema = await updatePersona("");

    if (!updatedSchema) {
      res.status(500).json({
        success: false,
        error: "Failed to clear persona",
      });
      return;
    }

    res.json({
      success: true,
      message: "Persona cleared successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export { personaRouter };
