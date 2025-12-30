import mongoose, { InferSchemaType } from "mongoose";

const ModelConfigSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true, default: "default" },
    // LLM Provider Configuration
    llmProvider: {
      type: String,
      enum: ["openai", "openrouter", "azure", "anthropic"],
      required: true,
      default: "openrouter",
    },
    llmApiKey: { type: String, required: false },
    llmBaseURL: { type: String, required: false },
    llmChatModel: {
      type: String,
      required: true,
      default: "openai/gpt-oss-20b",
    },
    llmEmbeddingModel: {
      type: String,
      required: true,
      default: "qwen/qwen3-embedding-4b",
    },
    // Indexing Config Generation Model (separate from query model)
    llmIndexingConfigModel: {
      type: String,
      required: false,
      default: "openai/gpt-oss-120b",
    },
    // Reranker Configuration
    rerankerEnabled: { type: Boolean, default: false },
    rerankerApiKey: { type: String, required: false },
    rerankerBaseURL: {
      type: String,
      default: "https://api.deepinfra.com/v1/inference",
    },
    rerankerModel: { type: String, default: "Qwen/Qwen3-Reranker-8B" },
    // Metadata
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "model_configs",
    timestamps: true,
  }
);

export type ModelConfig = InferSchemaType<typeof ModelConfigSchema>;

export const ModelConfigModel = mongoose.model<ModelConfig>(
  "ModelConfig",
  ModelConfigSchema
);
