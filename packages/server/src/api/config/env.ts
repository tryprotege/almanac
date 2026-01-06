import { Router, Request, Response } from "express";
import type { Router as ExpressRouter } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import logger from "../../utils/logger.js";
import {
  appEnvResult,
  applicationSchema,
  infrastructureSchema,
  sourceEnv,
} from "../../env.js";

const router: ExpressRouter = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../../../.env");

// Helper to write env map back to file, preserving comments
function writeEnvFile(updates: Record<string, string>): void {
  let content = "";

  // Read existing file or example
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, "utf-8");
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

// Helper to get schema defaults and info
function getSchemaInfo(schema: any): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, def] of Object.entries(schema.shape)) {
    const zodDef = def as any;
    result[key] = {
      type: zodDef._def.typeName?.replace("Zod", "").toLowerCase() || "string",
      required: !zodDef.isOptional(),
      default: zodDef._def.defaultValue?.() ?? undefined,
    };
  }
  return result;
}

// GET /api/config/env - Read current config with schema info and status
router.get("/", (_req: Request, res: Response) => {
  try {
    const invalidVars =
      appEnvResult.error?.issues.map((i) => String(i.path[0])) || [];

    // Get schema information
    const infraInfo = getSchemaInfo(infrastructureSchema);
    const appInfo = getSchemaInfo(applicationSchema);

    // Calculate configured and missing
    const configured: string[] = [];
    const missing: string[] = [];

    // Check infrastructure vars
    for (const [key, info] of Object.entries(infraInfo)) {
      if (process.env[key] || info.default !== undefined) {
        if (!invalidVars.includes(key)) {
          configured.push(key);
        }
      } else if (info.required) {
        missing.push(key);
      }
    }

    // Check application vars
    for (const [key, info] of Object.entries(appInfo)) {
      if (process.env[key] || info.default !== undefined) {
        if (!invalidVars.includes(key)) {
          configured.push(key);
        }
      } else if (info.required) {
        missing.push(key);
      }
    }

    const setupComplete = invalidVars.length === 0 && missing.length === 0;

    res.json({
      success: true,
      data: {
        values: sourceEnv,
        schema: {
          infrastructure: infraInfo,
          application: appInfo,
        },
        invalidVars,
        setupComplete,
        configured,
        missing,
      },
    });
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
    const updates: Record<string, any> = req.body;

    // Auto-generate encryption key if not provided
    if (!updates.ENCRYPTION_KEY && !process.env.ENCRYPTION_KEY) {
      updates.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
      logger.info("Auto-generated ENCRYPTION_KEY");
    }

    const allVars = [
      ...Object.keys(infrastructureSchema.shape),
      ...Object.keys(applicationSchema.shape),
    ];

    // Only accept the keys defined in the schemas
    const filteredUpdates: Record<string, string> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (allVars.includes(key)) {
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
    });
  } catch (err) {
    logger.error({ err }, "Error updating config");
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export { router as envConfigRouter };
