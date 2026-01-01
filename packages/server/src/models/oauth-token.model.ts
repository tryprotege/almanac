import mongoose, { InferSchemaType } from "mongoose";
import {
  encryptWithSalt,
  decryptWithSalt,
  generateSalt,
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

/**
 * OAuth Token Mongoose Schema
 * Stores OAuth access/refresh tokens with per-record salt encryption
 */
const OAuthTokenSchema = new mongoose.Schema(
  {
    // Reference to MCP server config
    mcpServerConfigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MCPServerConfig",
      required: true,
      index: true,
    },

    // OAuth Tokens (encrypted with per-record salt)
    accessToken: {
      type: String,
      required: true,
    },
    refreshToken: {
      type: String,
      required: false,
    },

    // Per-record salt for encryption
    salt: {
      type: String,
      required: true,
    },

    // Token Metadata
    tokenType: {
      type: String,
      default: "Bearer",
    },
    scope: [{ type: String }],
    expiresAt: {
      type: Date,
      index: true,
    },
    refreshExpiresAt: {
      type: Date,
    },

    // OAuth State (for validating callback)
    state: {
      type: String,
      index: true,
    },

    // PKCE code verifier (encrypted)
    codeVerifier: {
      type: String,
    },
  },
  {
    collection: "oauth_tokens",
    timestamps: true,
  }
);

// Create indexes
OAuthTokenSchema.index({ mcpServerConfigId: 1 }, { unique: true });
OAuthTokenSchema.index({ expiresAt: 1 });
OAuthTokenSchema.index({ state: 1 });

// Pre-save hook to encrypt tokens
OAuthTokenSchema.pre("save", function () {
  if (!encryptionKey) {
    throw new Error("Encryption key not configured");
  }

  // Generate salt if this is a new document
  if (this.isNew && !this.salt) {
    this.salt = generateSalt();
    logger.debug(
      { mcpServerConfigId: this.mcpServerConfigId },
      "Generated salt for new OAuth token"
    );
  }

  // Encrypt access token if modified
  if (this.isModified("accessToken") && this.accessToken && this.salt) {
    // Only encrypt if not already encrypted
    if (!this.accessToken.startsWith("enc:")) {
      this.accessToken = encryptWithSalt(
        this.accessToken,
        encryptionKey,
        this.salt
      );
      logger.debug(
        { mcpServerConfigId: this.mcpServerConfigId },
        "Encrypted access token"
      );
    }
  }

  // Encrypt refresh token if modified
  if (this.isModified("refreshToken") && this.refreshToken && this.salt) {
    // Only encrypt if not already encrypted
    if (!this.refreshToken.startsWith("enc:")) {
      this.refreshToken = encryptWithSalt(
        this.refreshToken,
        encryptionKey,
        this.salt
      );
      logger.debug(
        { mcpServerConfigId: this.mcpServerConfigId },
        "Encrypted refresh token"
      );
    }
  }

  // Encrypt code verifier if modified
  if (this.isModified("codeVerifier") && this.codeVerifier && this.salt) {
    // Only encrypt if not already encrypted
    if (!this.codeVerifier.startsWith("enc:")) {
      this.codeVerifier = encryptWithSalt(
        this.codeVerifier,
        encryptionKey,
        this.salt
      );
      logger.debug(
        { mcpServerConfigId: this.mcpServerConfigId },
        "Encrypted code verifier"
      );
    }
  }
});

// Post-find hook to decrypt tokens
OAuthTokenSchema.post("find", function (docs: any[]) {
  if (encryptionKey) {
    docs.forEach((doc) => {
      if (doc.accessToken && doc.salt && doc.accessToken.startsWith("enc:")) {
        try {
          doc.accessToken = decryptWithSalt(
            doc.accessToken,
            encryptionKey,
            doc.salt
          );
        } catch (err) {
          logger.error(
            { err, mcpServerConfigId: doc.mcpServerConfigId },
            "Failed to decrypt access token"
          );
        }
      }

      if (doc.refreshToken && doc.salt && doc.refreshToken.startsWith("enc:")) {
        try {
          doc.refreshToken = decryptWithSalt(
            doc.refreshToken,
            encryptionKey,
            doc.salt
          );
        } catch (err) {
          logger.error(
            { err, mcpServerConfigId: doc.mcpServerConfigId },
            "Failed to decrypt refresh token"
          );
        }
      }

      if (doc.codeVerifier && doc.salt && doc.codeVerifier.startsWith("enc:")) {
        try {
          doc.codeVerifier = decryptWithSalt(
            doc.codeVerifier,
            encryptionKey,
            doc.salt
          );
        } catch (err) {
          logger.error(
            { err, mcpServerConfigId: doc.mcpServerConfigId },
            "Failed to decrypt code verifier"
          );
        }
      }
    });
  }
});

// Post-findOne hook to decrypt tokens
OAuthTokenSchema.post("findOne", function (doc: any) {
  if (doc && encryptionKey && doc.salt) {
    if (doc.accessToken && doc.accessToken.startsWith("enc:")) {
      try {
        doc.accessToken = decryptWithSalt(
          doc.accessToken,
          encryptionKey,
          doc.salt
        );
      } catch (err) {
        logger.error(
          { err, mcpServerConfigId: doc.mcpServerConfigId },
          "Failed to decrypt access token"
        );
      }
    }

    if (doc.refreshToken && doc.refreshToken.startsWith("enc:")) {
      try {
        doc.refreshToken = decryptWithSalt(
          doc.refreshToken,
          encryptionKey,
          doc.salt
        );
      } catch (err) {
        logger.error(
          { err, mcpServerConfigId: doc.mcpServerConfigId },
          "Failed to decrypt refresh token"
        );
      }
    }

    if (doc.codeVerifier && doc.codeVerifier.startsWith("enc:")) {
      try {
        doc.codeVerifier = decryptWithSalt(
          doc.codeVerifier,
          encryptionKey,
          doc.salt
        );
      } catch (err) {
        logger.error(
          { err, mcpServerConfigId: doc.mcpServerConfigId },
          "Failed to decrypt code verifier"
        );
      }
    }
  }
});

// Post-findOneAndUpdate hook to decrypt tokens
OAuthTokenSchema.post("findOneAndUpdate", function (doc: any) {
  if (doc && encryptionKey && doc.salt) {
    if (doc.accessToken && doc.accessToken.startsWith("enc:")) {
      try {
        doc.accessToken = decryptWithSalt(
          doc.accessToken,
          encryptionKey,
          doc.salt
        );
      } catch (err) {
        logger.error(
          { err, mcpServerConfigId: doc.mcpServerConfigId },
          "Failed to decrypt access token"
        );
      }
    }

    if (doc.refreshToken && doc.refreshToken.startsWith("enc:")) {
      try {
        doc.refreshToken = decryptWithSalt(
          doc.refreshToken,
          encryptionKey,
          doc.salt
        );
      } catch (err) {
        logger.error(
          { err, mcpServerConfigId: doc.mcpServerConfigId },
          "Failed to decrypt refresh token"
        );
      }
    }

    if (doc.codeVerifier && doc.codeVerifier.startsWith("enc:")) {
      try {
        doc.codeVerifier = decryptWithSalt(
          doc.codeVerifier,
          encryptionKey,
          doc.salt
        );
      } catch (err) {
        logger.error(
          { err, mcpServerConfigId: doc.mcpServerConfigId },
          "Failed to decrypt code verifier"
        );
      }
    }
  }
});

export type OAuthToken = InferSchemaType<typeof OAuthTokenSchema>;

// Export the model
export const OAuthTokenModel = mongoose.model<OAuthToken>(
  "OAuthToken",
  OAuthTokenSchema
);
