#!/usr/bin/env ts-node
import "dotenv/config";
import mongoose from "mongoose";
import { ModelConfigModel } from "../src/models/model-config.model.js";
import { env } from "../src/env.js";

async function updateModelConfig() {
  try {
    // Connect to MongoDB
    const mongoUri = `mongodb://${env.MONGO_USERNAME}:${env.MONGO_PASSWORD}@${env.MONGO_HOST}:${env.MONGO_PORT}/${env.MONGO_DB_NAME}?authSource=admin`;
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Update or create the default model config
    const result = await ModelConfigModel.findOneAndUpdate(
      { _id: "default" },
      {
        $set: {
          llmProvider: "openrouter",
          llmChatModel: process.env.LLM_CHAT_MODEL || "GPT_OSS_20B",
          llmIndexingConfigModel:
            process.env.LLM_INDEXING_CONFIG_MODEL || "claude-4.5-opus",
          llmEmbeddingModel:
            process.env.LLM_EMBEDDING_MODEL || "QWEN3_EMBEDDING_4B",
          llmApiKey: process.env.LLM_API_KEY,
          llmBaseURL: process.env.LLM_BASE_URL,
          rerankerEnabled: process.env.RERANKER_ENABLED === "TRUE",
          rerankerApiKey: process.env.RERANKER_API_KEY,
          rerankerBaseURL: process.env.RERANKER_BASE_URL,
          rerankerModel: process.env.RERANKER_MODEL,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    console.log("✅ Model configuration updated successfully:");
    console.log({
      llmProvider: result?.llmProvider,
      llmChatModel: result?.llmChatModel,
      llmIndexingConfigModel: result?.llmIndexingConfigModel,
      llmEmbeddingModel: result?.llmEmbeddingModel,
      llmBaseURL: result?.llmBaseURL,
      rerankerEnabled: result?.rerankerEnabled,
      rerankerModel: result?.rerankerModel,
    });

    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error updating model configuration:", error);
    process.exit(1);
  }
}

updateModelConfig();
