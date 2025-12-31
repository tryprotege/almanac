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

// Data Source Config Mongoose Schema
const DataSourceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      index: true,
      // No enum constraint - allow any server name for custom data sources
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
    collection: "data_sources",
    timestamps: true,
  }
);

// Create indexes
DataSourceSchema.index({ name: 1 }, { unique: true });

// Add validation for type-specific required fields and encrypt sensitive data
DataSourceSchema.pre("save", function () {
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
DataSourceSchema.post("find", function (docs: any[]) {
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
DataSourceSchema.post("findOne", function (doc: any) {
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
DataSourceSchema.post("findOneAndUpdate", function (doc: any) {
  if (doc && encryptionKey) {
    if (doc.env) {
      doc.env = decryptMapValues(doc.env, encryptionKey);
    }
    if (doc.headers) {
      doc.headers = decryptMapValues(doc.headers, encryptionKey);
    }
  }
});

export type DataSource = InferSchemaType<typeof DataSourceSchema>;

// Export the model
export const DataSourceModel = mongoose.model<DataSource>(
  "DataSource",
  DataSourceSchema
);
