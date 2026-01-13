import mongoose, { Schema, InferSchemaType } from 'mongoose';
import type { IndexingConfig as Config } from '@ebee-oss/indexing-engine';

const IndexingConfigSchema = new Schema(
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
      enum: ['draft', 'active', 'disabled'],
      default: 'draft',
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
    collection: 'indexing_configs',
    timestamps: true,
  },
);

// Indexes
IndexingConfigSchema.index({ serverName: 1, status: 1 });

type IndexingConfig = Omit<InferSchemaType<typeof IndexingConfigSchema>, 'config'> & {
  config: Config;
};

export const IndexingConfigModel = mongoose.model<IndexingConfig>(
  'IndexingConfig',
  IndexingConfigSchema,
);
