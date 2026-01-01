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

    // OAuth configuration for delegated authentication
    authType: {
      type: String,
      enum: ["none", "api-key", "oauth"],
      default: "none",
    },
    oauth: {
      // Discovery fields
      issuerUrl: { type: String }, // Base issuer URL for auto-discovery
      discoverySource: { type: String, enum: ["rfc8414", "oidc", "manual"] }, // How endpoints were obtained

      // OAuth endpoints (can be discovered or manually entered)
      authorizationUrl: { type: String },
      tokenUrl: { type: String },

      // Dynamic client registration (MCP SDK pattern)
      clientMetadataUrl: { type: String }, // URL where server publishes client metadata
      clientMetadata: {
        clientId: { type: String },
        clientSecret: { type: String }, // Encrypted
        clientIdIssuedAt: { type: Number },
        clientSecretExpiresAt: { type: Number },
        registrationAccessToken: { type: String }, // Encrypted - for updating registration
      },
      registrationStatus: {
        type: String,
        enum: ["pending", "registered", "manual"],
        default: "manual",
      },

      // Static client credentials (for manual configuration)
      clientId: { type: String },
      clientSecret: { type: String }, // Encrypted

      // Configuration
      redirectUri: { type: String },
      scopes: [{ type: String }],
      usePKCE: { type: Boolean, default: true },

      // Legacy field - kept for backwards compatibility
      metadataUrl: { type: String }, // Optional - for RFC 8414 compliant servers
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

  // Encrypt OAuth clientSecret if modified
  if (
    this.isModified("oauth.clientSecret") &&
    this.oauth?.clientSecret &&
    encryptionKey
  ) {
    if (!isEncrypted(this.oauth.clientSecret)) {
      this.oauth.clientSecret = encrypt(this.oauth.clientSecret, encryptionKey);
      logger.debug(
        { configName: this.name },
        "Encrypted OAuth clientSecret for config"
      );
    }
  }

  // Encrypt dynamic client registration secrets
  if (
    this.isModified("oauth.clientMetadata.clientSecret") &&
    this.oauth?.clientMetadata?.clientSecret &&
    encryptionKey
  ) {
    if (!isEncrypted(this.oauth.clientMetadata.clientSecret)) {
      this.oauth.clientMetadata.clientSecret = encrypt(
        this.oauth.clientMetadata.clientSecret,
        encryptionKey
      );
      logger.debug(
        { configName: this.name },
        "Encrypted OAuth clientMetadata.clientSecret for config"
      );
    }
  }

  if (
    this.isModified("oauth.clientMetadata.registrationAccessToken") &&
    this.oauth?.clientMetadata?.registrationAccessToken &&
    encryptionKey
  ) {
    if (!isEncrypted(this.oauth.clientMetadata.registrationAccessToken)) {
      this.oauth.clientMetadata.registrationAccessToken = encrypt(
        this.oauth.clientMetadata.registrationAccessToken,
        encryptionKey
      );
      logger.debug(
        { configName: this.name },
        "Encrypted OAuth registrationAccessToken for config"
      );
    }
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
      if (doc.oauth?.clientSecret && isEncrypted(doc.oauth.clientSecret)) {
        try {
          doc.oauth.clientSecret = decrypt(
            doc.oauth.clientSecret,
            encryptionKey
          );
        } catch (err) {
          logger.error(
            { err, configName: doc.name },
            "Failed to decrypt OAuth clientSecret"
          );
        }
      }
      if (
        doc.oauth?.clientMetadata?.clientSecret &&
        isEncrypted(doc.oauth.clientMetadata.clientSecret)
      ) {
        try {
          doc.oauth.clientMetadata.clientSecret = decrypt(
            doc.oauth.clientMetadata.clientSecret,
            encryptionKey
          );
        } catch (err) {
          logger.error(
            { err, configName: doc.name },
            "Failed to decrypt OAuth clientMetadata.clientSecret"
          );
        }
      }
      if (
        doc.oauth?.clientMetadata?.registrationAccessToken &&
        isEncrypted(doc.oauth.clientMetadata.registrationAccessToken)
      ) {
        try {
          doc.oauth.clientMetadata.registrationAccessToken = decrypt(
            doc.oauth.clientMetadata.registrationAccessToken,
            encryptionKey
          );
        } catch (err) {
          logger.error(
            { err, configName: doc.name },
            "Failed to decrypt OAuth registrationAccessToken"
          );
        }
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
    if (doc.oauth?.clientSecret && isEncrypted(doc.oauth.clientSecret)) {
      try {
        doc.oauth.clientSecret = decrypt(doc.oauth.clientSecret, encryptionKey);
      } catch (err) {
        logger.error(
          { err, configName: doc.name },
          "Failed to decrypt OAuth clientSecret"
        );
      }
    }
    if (
      doc.oauth?.clientMetadata?.clientSecret &&
      isEncrypted(doc.oauth.clientMetadata.clientSecret)
    ) {
      try {
        doc.oauth.clientMetadata.clientSecret = decrypt(
          doc.oauth.clientMetadata.clientSecret,
          encryptionKey
        );
      } catch (err) {
        logger.error(
          { err, configName: doc.name },
          "Failed to decrypt OAuth clientMetadata.clientSecret"
        );
      }
    }
    if (
      doc.oauth?.clientMetadata?.registrationAccessToken &&
      isEncrypted(doc.oauth.clientMetadata.registrationAccessToken)
    ) {
      try {
        doc.oauth.clientMetadata.registrationAccessToken = decrypt(
          doc.oauth.clientMetadata.registrationAccessToken,
          encryptionKey
        );
      } catch (err) {
        logger.error(
          { err, configName: doc.name },
          "Failed to decrypt OAuth registrationAccessToken"
        );
      }
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
    if (doc.oauth?.clientSecret && isEncrypted(doc.oauth.clientSecret)) {
      try {
        doc.oauth.clientSecret = decrypt(doc.oauth.clientSecret, encryptionKey);
      } catch (err) {
        logger.error(
          { err, configName: doc.name },
          "Failed to decrypt OAuth clientSecret"
        );
      }
    }
    if (
      doc.oauth?.clientMetadata?.clientSecret &&
      isEncrypted(doc.oauth.clientMetadata.clientSecret)
    ) {
      try {
        doc.oauth.clientMetadata.clientSecret = decrypt(
          doc.oauth.clientMetadata.clientSecret,
          encryptionKey
        );
      } catch (err) {
        logger.error(
          { err, configName: doc.name },
          "Failed to decrypt OAuth clientMetadata.clientSecret"
        );
      }
    }
    if (
      doc.oauth?.clientMetadata?.registrationAccessToken &&
      isEncrypted(doc.oauth.clientMetadata.registrationAccessToken)
    ) {
      try {
        doc.oauth.clientMetadata.registrationAccessToken = decrypt(
          doc.oauth.clientMetadata.registrationAccessToken,
          encryptionKey
        );
      } catch (err) {
        logger.error(
          { err, configName: doc.name },
          "Failed to decrypt OAuth registrationAccessToken"
        );
      }
    }
  }
});

export type MCPServerConfig = InferSchemaType<typeof MCPServerConfigSchema>;

// Export the model
export const MCPServerConfigModel = mongoose.model<MCPServerConfig>(
  "MCPServerConfig",
  MCPServerConfigSchema
);
