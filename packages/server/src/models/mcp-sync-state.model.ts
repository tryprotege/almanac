import mongoose, { Schema, Document } from 'mongoose';

export interface IFetcherCursor {
  lastSyncAt: Date;
  cursor?: string;
  lastRecordId?: string;
  syncedCount: number;
}

export interface IMCPSyncState extends Document {
  serverName: string;
  configId: mongoose.Types.ObjectId;
  configVersion: number;

  status: 'idle' | 'syncing' | 'error' | 'paused';

  fetcherCursors: Map<string, IFetcherCursor>;

  lastFullSyncAt?: Date;
  lastIncrementalSyncAt?: Date;
  totalRecordsSynced: number;

  lastError?: {
    message: string;
    stack?: string;
    occurredAt: Date;
    fetcherName?: string;
  };
  consecutiveErrors: number;

  createdAt: Date;
  updatedAt: Date;
}

const FetcherCursorSchema = new Schema<IFetcherCursor>(
  {
    lastSyncAt: { type: Date, required: true },
    cursor: { type: String },
    lastRecordId: { type: String },
    syncedCount: { type: Number, default: 0 },
  },
  { _id: false },
);

const MCPSyncStateSchema = new Schema<IMCPSyncState>(
  {
    serverName: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    configId: {
      type: Schema.Types.ObjectId,
      ref: 'IndexingConfig',
      required: true,
    },
    configVersion: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['idle', 'syncing', 'error', 'paused'],
      default: 'idle',
      index: true,
    },
    fetcherCursors: {
      type: Map,
      of: FetcherCursorSchema,
      default: new Map(),
    },
    lastFullSyncAt: { type: Date },
    lastIncrementalSyncAt: { type: Date },
    totalRecordsSynced: { type: Number, default: 0 },
    lastError: {
      message: { type: String },
      stack: { type: String },
      occurredAt: { type: Date },
      fetcherName: { type: String },
    },
    consecutiveErrors: { type: Number, default: 0 },
  },
  {
    collection: 'mcp_sync_states',
    timestamps: true,
  },
);

// Indexes
MCPSyncStateSchema.index({ serverName: 1, status: 1 });
MCPSyncStateSchema.index({ configId: 1 });

export const MCPSyncStateModel = mongoose.model<IMCPSyncState>('MCPSyncState', MCPSyncStateSchema);
