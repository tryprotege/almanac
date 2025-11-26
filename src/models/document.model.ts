import mongoose from "mongoose";

export interface IDocument {
  _id?: string;
  source: string;
  type: string;
  content: {
    raw: string;
    text: string;
    chunks?: Array<{
      text: string;
      start: number;
      end: number;
    }>;
  };
  entities?: Array<{
    type: string;
    name: string;
    confidence: number;
  }>;
  relationships?: Array<{
    source: string;
    target: string;
    type: string;
    confidence: number;
  }>;
  metadata: {
    title?: string;
    author?: string;
    tags?: string[];
    [key: string]: any;
  };
  indexedAt: Date;
  updatedAt?: Date;
}

const DocumentSchema = new mongoose.Schema<IDocument>(
  {
    source: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true },
    content: {
      raw: { type: String, required: true },
      text: { type: String, required: true },
      chunks: [
        {
          text: String,
          start: Number,
          end: Number,
        },
      ],
    },
    entities: [
      {
        type: String,
        name: String,
        confidence: Number,
      },
    ],
    relationships: [
      {
        source: String,
        target: String,
        type: String,
        confidence: Number,
      },
    ],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    indexedAt: { type: Date, default: Date.now, index: true },
  },
  {
    collection: "documents",
    timestamps: true,
  }
);

// Create indexes
DocumentSchema.index({ source: 1, type: 1 });
DocumentSchema.index({ "metadata.tags": 1 });
DocumentSchema.index({ "content.text": "text" }); // Full-text search

export const DocumentModel = mongoose.model<IDocument>(
  "Document",
  DocumentSchema
);
