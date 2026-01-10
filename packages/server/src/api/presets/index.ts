import { Router } from "express";
import { presetLoader } from "../../services/presets/preset-loader.service.js";
import logger from "../../utils/logger.js";

const router: Router = Router();

/**
 * GET /api/presets
 * List all available presets (summaries without full indexing configs)
 */
router.get("/", async (_req, res) => {
  try {
    const summaries = presetLoader.getPresetSummaries();
    logger.info({ count: summaries.length }, "Retrieved preset summaries");
    return res.json(summaries);
  } catch (error) {
    logger.error({ error }, "Failed to get preset summaries");
    return res.status(500).json({ error: "Failed to load presets" });
  }
});

/**
 * GET /api/presets/:id
 * Get full preset details including indexing config
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const preset = presetLoader.getPreset(id);

    if (!preset) {
      logger.warn({ presetId: id }, "Preset not found");
      return res.status(404).json({ error: "Preset not found" });
    }

    logger.info({ presetId: id }, "Retrieved preset details");
    return res.json(preset);
  } catch (error) {
    logger.error({ error, presetId: req.params.id }, "Failed to get preset");
    return res.status(500).json({ error: "Failed to load preset" });
  }
});

export default router;
