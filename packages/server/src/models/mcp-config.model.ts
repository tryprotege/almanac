import mongoose, { InferSchemaType } from "mongoose";
import { SourceType } from "../types/index.js";
import {
  encryptMapValues,
  decryptMapValues,
  hexToBuffer,
} from "@ebee-oss/shared-util";
import logger from "../utils/logger.js";
import { env } from "../env.js";

// Get encryption key once at module load
let encryptionKey: Buffer;
try {
  if (env.ENCRYPTION_KEY) encryptionKey = hexToBuffer(env.ENCRYPTION_KEY);
} catch (err) {
  logger.error({ err }, "Failed to load encryption key");
  throw err;
}

// MCP Server Config Mongoose Schema
const MCPServerConfigSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      index: true,
      // No enum constraint - allow any server name for custom MCP servers
    },
    type: {
      type: String,
      required: true,
      enum: ["stdio", "sse", "streamable-http"],
    },
    command: { type: String },
    args: [{ type: String }],
    env: { type: Map, of: String },
    url: { type: String },
    headers: { type: Map, of: String },
    isDisabled: { type: Boolean, default: false },
  },
  {
    collection: "mcp_server_configs",
    timestamps: true,
  }
);

// Create indexes
MCPServerConfigSchema.index({ name: 1 }, { unique: true });

// Add validation for type-specific required fields and encrypt sensitive data
MCPServerConfigSchema.pre("save", function () {
  // Validate type-specific fields
  if (this.type === "stdio" && !this.command) {
    throw new Error("stdio server requires 'command' field");
  } else if (
    (this.type === "sse" || this.type === "streamable-http") &&
    !this.url
  ) {
    throw new Error(`${this.type} server requires 'url' field`);
  }

  // Encrypt env values if modified
  if (this.isModified("env") && this.env && encryptionKey) {
    this.env = encryptMapValues(this.env, encryptionKey);
    logger.debug({ configName: this.name }, "Encrypted env values for config");
  }

  // Encrypt headers values if modified
  if (this.isModified("headers") && this.headers && encryptionKey) {
    this.headers = encryptMapValues(this.headers, encryptionKey);
    logger.debug(
      { configName: this.name },
      "Encrypted headers values for config"
    );
  }
});

// Decrypt after finding multiple documents
MCPServerConfigSchema.post("find", function (docs: any[]) {
  if (encryptionKey) {
    docs.forEach((doc) => {
      if (doc.env) {
        doc.env = decryptMapValues(doc.env, encryptionKey);
      }
      if (doc.headers) {
        doc.headers = decryptMapValues(doc.headers, encryptionKey);
      }
    });
  }
});

// Decrypt after finding single document
MCPServerConfigSchema.post("findOne", function (doc: any) {
  if (doc && encryptionKey) {
    if (doc.env && encryptionKey) {
      doc.env = decryptMapValues(doc.env, encryptionKey);
    }
    if (doc.headers) {
      doc.headers = decryptMapValues(doc.headers, encryptionKey);
    }
  }
});

// Decrypt after findOneAndUpdate
MCPServerConfigSchema.post("findOneAndUpdate", function (doc: any) {
  if (doc && encryptionKey) {
    if (doc.env) {
      doc.env = decryptMapValues(doc.env, encryptionKey);
    }
    if (doc.headers) {
      doc.headers = decryptMapValues(doc.headers, encryptionKey);
    }
  }
});

export type MCPServerConfig = InferSchemaType<typeof MCPServerConfigSchema>;

// Export the model
export const MCPServerConfigModel = mongoose.model<MCPServerConfig>(
  "MCPServerConfig",
  MCPServerConfigSchema
);
