import { Request, Response, Router } from "express";
import { env } from "../../env.js";
import { mockModelConfig } from "../../mock/index.js";
import { ModelConfigModel } from "../../models/model-config.model.js";
import { createLLMClient } from "../../services/llm/providers.js";

const configRouter: Router = Router();

// GET /api/config/models - Get current model configuration
configRouter.get("/models", async (_req: Request, res: Response) => {
  try {
    // Return mock data if enabled
    if (env.ENABLE_MOCK_DATA) {
      res.json({
        success: true,
        data: mockModelConfig,
      });
      return;
    }

    let config = await ModelConfigModel.findById("default");

    // If no config exists, create default from environment variables
    if (!config) {
      config = new ModelConfigModel({
        _id: "default",
        llmProvider: env.LLM_PROVIDER,
        llmApiKey: env.LLM_API_KEY,
        llmBaseURL: env.LLM_BASE_URL,
        llmChatModel: env.LLM_CHAT_MODEL,
        llmEmbeddingModel: env.LLM_EMBEDDING_MODEL,
        rerankerEnabled: env.RERANKER_ENABLED,
        rerankerApiKey: env.RERANKER_API_KEY,
        rerankerBaseURL: env.RERANKER_BASE_URL,
        rerankerModel: env.RERANKER_MODEL,
      });
      await config.save();
    }

    // Mask sensitive data
    const safeConfig = {
      llmProvider: config.llmProvider,
      llmApiKey: config.llmApiKey,
      llmBaseURL: config.llmBaseURL,
      llmChatModel: config.llmChatModel,
      llmEmbeddingModel: config.llmEmbeddingModel,
      rerankerEnabled: config.rerankerEnabled,
      rerankerApiKey: config.rerankerApiKey,
      rerankerBaseURL: config.rerankerBaseURL,
      rerankerModel: config.rerankerModel,
      updatedAt: config.updatedAt,
    };

    res.json({
      success: true,
      data: safeConfig,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// PUT /api/config/models - Update model configuration
configRouter.put("/models", async (req: Request, res: Response) => {
  try {
    const updateData = req.body;

    // Get existing config or create new one
    let config = await ModelConfigModel.findById("default");

    if (!config) {
      config = new ModelConfigModel({ _id: "default" });
    }

    // Only update fields that are provided
    if (updateData.llmProvider !== undefined) {
      config.llmProvider = updateData.llmProvider;
    }
    if (updateData.llmApiKey !== undefined) {
      // Don't update if it's a masked value
      if (!updateData.llmApiKey.includes("***")) {
        config.llmApiKey = updateData.llmApiKey;
      }
    }
    if (updateData.llmBaseURL !== undefined) {
      config.llmBaseURL = updateData.llmBaseURL;
    }
    if (updateData.llmChatModel !== undefined) {
      config.llmChatModel = updateData.llmChatModel;
    }
    if (updateData.llmEmbeddingModel !== undefined) {
      config.llmEmbeddingModel = updateData.llmEmbeddingModel;
    }
    if (updateData.rerankerEnabled !== undefined) {
      config.rerankerEnabled = updateData.rerankerEnabled;
    }
    if (updateData.rerankerApiKey !== undefined) {
      // Don't update if it's a masked value
      if (!updateData.rerankerApiKey.includes("***")) {
        config.rerankerApiKey = updateData.rerankerApiKey;
      }
    }
    if (updateData.rerankerBaseURL !== undefined) {
      config.rerankerBaseURL = updateData.rerankerBaseURL;
    }
    if (updateData.rerankerModel !== undefined) {
      config.rerankerModel = updateData.rerankerModel;
    }

    config.updatedAt = new Date();
    await config.save();

    // Return masked config
    const safeConfig = {
      llmProvider: config.llmProvider,
      llmApiKey: config.llmApiKey ? maskApiKey(config.llmApiKey) : undefined,
      llmBaseURL: config.llmBaseURL,
      llmChatModel: config.llmChatModel,
      llmEmbeddingModel: config.llmEmbeddingModel,
      rerankerEnabled: config.rerankerEnabled,
      rerankerApiKey: config.rerankerApiKey
        ? maskApiKey(config.rerankerApiKey)
        : undefined,
      rerankerBaseURL: config.rerankerBaseURL,
      rerankerModel: config.rerankerModel,
      updatedAt: config.updatedAt,
    };

    res.json({
      success: true,
      data: safeConfig,
      message: "Model configuration updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// POST /api/config/models/test - Test model connection
configRouter.post("/models/test", async (req: Request, res: Response) => {
  try {
    const { llmProvider, llmApiKey, llmBaseURL, llmChatModel } = req.body;

    if (!llmApiKey || !llmChatModel) {
      res.status(400).json({
        success: false,
        error: "API key and model are required for testing",
      });
      return;
    }

    // Create a test client
    const testClient = createLLMClient(llmProvider, llmApiKey, llmBaseURL);

    // Try a simple completion
    const testCompletion = await testClient.chat.completions.create({
      model: llmChatModel,
      messages: [
        {
          role: "user",
          content: "Say 'test successful' if you can read this.",
        },
      ],
      max_tokens: 10,
      temperature: 0,
    });

    const response = testCompletion.choices[0]?.message?.content || "";

    res.json({
      success: true,
      message: "Connection test successful",
      data: {
        response,
        model: llmChatModel,
        provider: llmProvider,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: `Connection test failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }
});

// Helper function to mask API keys
function maskApiKey(key: string): string {
  if (!key || key.length < 8) return "***";
  return `${key.substring(0, 4)}${"*".repeat(
    Math.min(20, key.length - 8)
  )}${key.substring(key.length - 4)}`;
}

export { configRouter };
