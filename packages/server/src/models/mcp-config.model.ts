import mongoose, { InferSchemaType } from "mongoose";
import { SourceType } from "../types/index.js";
import {
  encryptMapValues,
  decryptMapValues,
  hexToBuffer,
  encrypt,
  decrypt,
  isEncrypted,
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
      enum: [
        "notion",
        "slack",
        "calendar",
        "jira",
        "github",
        "fathom",
      ] satisfies SourceType[],
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
    // OAuth fields
    authType: {
      type: String,
      enum: ["api_key", "oauth"],
      default: "api_key",
    },
    oauthTokens: {
      accessToken: { type: String },
      refreshToken: { type: String },
      expiresAt: { type: Date },
      scope: { type: String },
      tokenType: { type: String },
    },
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

  // Encrypt OAuth tokens if modified
  if (this.isModified("oauthTokens") && this.oauthTokens && encryptionKey) {
    if (
      this.oauthTokens.accessToken &&
      !isEncrypted(this.oauthTokens.accessToken)
    ) {
      this.oauthTokens.accessToken = encrypt(
        this.oauthTokens.accessToken,
        encryptionKey
      );
    }
    if (
      this.oauthTokens.refreshToken &&
      !isEncrypted(this.oauthTokens.refreshToken)
    ) {
      this.oauthTokens.refreshToken = encrypt(
        this.oauthTokens.refreshToken,
        encryptionKey
      );
    }
    logger.debug(
      { configName: this.name },
      "Encrypted OAuth tokens for config"
    );
  }
});

// Helper function to decrypt OAuth tokens
function decryptOAuthTokens(doc: any) {
  if (doc.oauthTokens && encryptionKey) {
    if (
      doc.oauthTokens.accessToken &&
      isEncrypted(doc.oauthTokens.accessToken)
    ) {
      try {
        doc.oauthTokens.accessToken = decrypt(
          doc.oauthTokens.accessToken,
          encryptionKey
        );
      } catch (err) {
        logger.error(
          { err, configName: doc.name },
          "Failed to decrypt access token"
        );
      }
    }
    if (
      doc.oauthTokens.refreshToken &&
      isEncrypted(doc.oauthTokens.refreshToken)
    ) {
      try {
        doc.oauthTokens.refreshToken = decrypt(
          doc.oauthTokens.refreshToken,
          encryptionKey
        );
      } catch (err) {
        logger.error(
          { err, configName: doc.name },
          "Failed to decrypt refresh token"
        );
      }
    }
  }
}

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
      decryptOAuthTokens(doc);
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
    decryptOAuthTokens(doc);
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
    decryptOAuthTokens(doc);
  }
});

export type MCPServerConfig = InferSchemaType<typeof MCPServerConfigSchema>;

// Export the model
export const MCPServerConfigModel = mongoose.model<MCPServerConfig>(
  "MCPServerConfig",
  MCPServerConfigSchema
);
