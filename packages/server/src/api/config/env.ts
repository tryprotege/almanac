import { Router, Request, Response } from "express";
import type { Router as ExpressRouter } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import logger from "../../utils/logger.js";

const router: ExpressRouter = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../../../.env");
const envExamplePath = path.join(__dirname, "../../../.env.example");

// Helper to write env map back to file, preserving comments
function writeEnvFile(updates: Record<string, string>): void {
  let content = "";

  // Read existing file or example
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, "utf-8");
  } else if (fs.existsSync(envExamplePath)) {
    content = fs.readFileSync(envExamplePath, "utf-8");
  }

  const lines = content.split("\n");
  const updatedKeys = new Set<string>();

  // Update existing keys
  const newLines = lines.map((line) => {
    if (line.trim().startsWith("#") || !line.trim()) {
      return line;
    }

    const match = line.match(/^([^#=]+)=/);
    if (match) {
      const key = match[1].trim();
      if (key in updates) {
        updatedKeys.add(key);
        return `${key}=${updates[key]}`;
      }
    }

    return line;
  });

  // Add new keys that weren't in the file
  for (const [key, value] of Object.entries(updates)) {
    if (!updatedKeys.has(key)) {
      newLines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(envPath, newLines.join("\n"));
}

// GET /api/config/status - Check configuration status
router.get("/status", (_req: Request, res: Response) => {
  try {
    const missing: string[] = [];
    const configured: string[] = [];

    const requiredAppVars = [
      "LLM_API_KEY",
      "LLM_PROVIDER",
      "LLM_CHAT_MODEL",
      "LLM_EMBEDDING_MODEL",
      "LLM_INDEXING_CONFIG_MODEL",
    ];

    requiredAppVars.forEach((key) => {
      if (process.env[key] && process.env[key] !== "your_llm_api_key_here") {
        configured.push(key);
      } else {
        missing.push(key);
      }
    });

    res.json({
      success: true,
      data: {
        setupComplete: missing.length === 0,
        configured,
        missing,
        optional: ["RERANKER_API_KEY", "ENCRYPTION_KEY"],
      },
    });
  } catch (err) {
    logger.error({ err }, "Error checking config status");
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// GET /api/config/env - Read current config (masked)
router.get("/", (_req: Request, res: Response) => {
  try {
    const maskValue = (value: string | undefined): string => {
      if (
        !value ||
        value === "your_llm_api_key_here" ||
        value === "your_fireworks_api_key_here"
      ) {
        return "";
      }
      // Mask API keys but show first/last few chars
      if (value.length > 8) {
        return `${value.substring(0, 4)}${"•".repeat(8)}${value.substring(
          value.length - 4
        )}`;
      }
      return "••••••••";
    };

    const config = {
      LLM_PROVIDER: process.env.LLM_PROVIDER || "openrouter",
      LLM_API_KEY: maskValue(process.env.LLM_API_KEY),
      LLM_BASE_URL: process.env.LLM_BASE_URL || "",
      LLM_CHAT_MODEL: process.env.LLM_CHAT_MODEL || "openai/gpt-oss-20b",
      LLM_EMBEDDING_MODEL:
        process.env.LLM_EMBEDDING_MODEL || "qwen/qwen3-embedding-4b",
      LLM_INDEXING_CONFIG_MODEL:
        process.env.LLM_INDEXING_CONFIG_MODEL || "openai/gpt-oss-120b",
      RERANKER_ENABLED: process.env.RERANKER_ENABLED || "false",
      RERANKER_API_KEY: maskValue(process.env.RERANKER_API_KEY),
      RERANKER_BASE_URL:
        process.env.RERANKER_BASE_URL ||
        "https://api.fireworks.ai/inference/v1/rerank",
      RERANKER_MODEL:
        process.env.RERANKER_MODEL || "fireworks/qwen3-reranker-8b",
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ? "••••••••" : "",
      DB_INDEXING_CONCURRENCY: process.env.DB_INDEXING_CONCURRENCY || "32",
      SCHEMA_LEARNING_CONCURRENCY:
        process.env.SCHEMA_LEARNING_CONCURRENCY || "32",
      VECTOR_INDEXING_CONCURRENCY:
        process.env.VECTOR_INDEXING_CONCURRENCY || "32",
      GRAPH_EXTRACTION_CONCURRENCY:
        process.env.GRAPH_EXTRACTION_CONCURRENCY || "32",
    };

    res.json({ success: true, data: config });
  } catch (err) {
    logger.error({ err }, "Error reading config");
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// PUT /api/config/env - Update .env file
router.put("/", async (req: Request, res: Response) => {
  try {
    const updates = req.body;

    // Validate required fields
    const requiredFields = ["LLM_API_KEY", "LLM_PROVIDER"];
    for (const field of requiredFields) {
      if (!updates[field]) {
        res.status(400).json({
          success: false,
          error: `Missing required field: ${field}`,
        });
        return;
      }
    }

    // Auto-generate encryption key if not provided
    if (!updates.ENCRYPTION_KEY && !process.env.ENCRYPTION_KEY) {
      updates.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
      logger.info("Auto-generated ENCRYPTION_KEY");
    }

    // Filter out masked values (don't update if user didn't change)
    const filteredUpdates: Record<string, string> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === "string" && !value.includes("•")) {
        filteredUpdates[key] = value;
      }
    }

    // Write to .env file
    writeEnvFile(filteredUpdates);

    logger.info(
      { keys: Object.keys(filteredUpdates) },
      "Configuration updated"
    );

    res.json({
      success: true,
      message:
        "Configuration saved. Please restart the server for changes to take effect.",
      restartRequired: true,
    });
  } catch (err) {
    logger.error({ err }, "Error updating config");
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// POST /api/config/validate - Test LLM connection
router.post("/validate", async (req: Request, res: Response) => {
  try {
    const { provider, apiKey, chatModel, embeddingModel } = req.body;

    const results = {
      llm: { valid: false, error: null as string | null },
      embedding: { valid: false, error: null as string | null },
    };

    // Basic validation
    if (!provider || !apiKey) {
      res.status(400).json({
        success: false,
        error: "Provider and API key are required",
      });
      return;
    }

    // For now, just validate format
    // TODO: Add actual API calls to test connectivity
    if (apiKey.length > 10) {
      results.llm.valid = true;
      results.embedding.valid = true;
    } else {
      results.llm.error = "API key appears to be invalid";
      results.embedding.error = "API key appears to be invalid";
    }

    res.json({ success: true, data: results });
  } catch (err) {
    logger.error({ err }, "Error validating config");
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// POST /api/config/restart - Trigger server restart
router.post("/restart", (_req: Request, res: Response) => {
  logger.info("Server restart requested");
  res.json({ success: true, message: "Server restarting..." });

  // Give time for response to be sent
  setTimeout(() => {
    process.exit(0); // Docker/PM2 will restart the process
  }, 500);
});

export { router as envConfigRouter };
