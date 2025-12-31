import mongoose, { Schema, Document } from "mongoose";
import type { SyncConfig } from "@ebee-oss/indexing-engine";

export interface ISyncConfig extends Document {
  serverName: string;
  displayName: string;
  status: "draft" | "active" | "disabled";
  configVersion: number;
  config: SyncConfig;
  createdAt: Date;
  updatedAt: Date;
}

const SyncConfigSchema = new Schema<ISyncConfig>(
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
  },
  {
    collection: "sync_configs",
    timestamps: true,
  }
);

// Indexes
SyncConfigSchema.index({ serverName: 1, status: 1 });

export const SyncConfigModel = mongoose.model<ISyncConfig>(
  "SyncConfig",
  SyncConfigSchema
);
