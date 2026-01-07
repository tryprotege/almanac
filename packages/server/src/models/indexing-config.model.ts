import mongoose, { Schema, Document } from "mongoose";
import type { IndexingConfig } from "@ebee-oss/indexing-engine";

export interface IIndexingConfig extends Document {
  serverName: string;
  displayName: string;
  status: "draft" | "active" | "disabled";
  configVersion: number;
  config: IndexingConfig;

  /**
   * User-provided starting point values
   * Maps starting point name to array of values
   * Example: { "root_pages": ["abc123", "def456"] }
   */
  startingPointValues?: Record<string, string[]>;

  createdAt: Date;
  updatedAt: Date;
}

const IndexingConfigSchema = new Schema<IIndexingConfig>(
  {
    serverName: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["draft", "active", "disabled"],
      default: "draft",
      index: true,
    },
    configVersion: {
      type: Number,
      default: 1,
    },
    config: {
      type: Schema.Types.Mixed,
      required: true,
    },
    startingPointValues: {
      type: Map,
      of: [String],
      required: false,
    },
  },
  {
    collection: "indexing_configs",
    timestamps: true,
  }
);

// Indexes
IndexingConfigSchema.index({ serverName: 1, status: 1 });

export const IndexingConfigModel = mongoose.model<IIndexingConfig>(
  "IndexingConfig",
  IndexingConfigSchema
);
