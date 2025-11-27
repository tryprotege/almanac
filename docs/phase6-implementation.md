# Phase 6: Model Configuration - Implementation

## Overview

This document describes the implementation of Phase 6: Model Configuration for the eBee Dashboard project.

## Goal

Create a user interface for configuring LLM and embedding models, including provider selection, API keys, and connection testing.

## Implementation Summary

### Backend

#### 1. Model Configuration Model (`model-config.model.ts`)

Created a Mongoose model for storing model configuration:

- **File**: [`packages/server/src/models/model-config.model.ts`](../packages/server/src/models/model-config.model.ts)
- **Features**:
  - Stores LLM provider configuration (OpenAI, OpenRouter, Azure, Anthropic)
  - Stores API keys securely in MongoDB
  - Configures chat and embedding models
  - Optional reranker configuration
  - Tracks last update timestamp

#### 2. Model Configuration API (`api/config/index.ts`)

Created REST API endpoints for model configuration:

- **File**: [`packages/server/src/api/config/index.ts`](../packages/server/src/api/config/index.ts)
- **Endpoints**:

  - `GET /api/config/models` - Get current model configuration (with masked API keys)
  - `PUT /api/config/models` - Update model configuration
  - `POST /api/config/models/test` - Test model connection

- **Features**:
  - API key masking for security
  - Default configuration from environment variables
  - Connection testing with real LLM API calls
  - Validation and error handling

### Frontend Components

#### 1. Model Configuration API Client

Updated API client with model configuration functions:

- **File**: [`packages/client/src/lib/api.ts`](../packages/client/src/lib/api.ts)
- **Types**:
  - `ModelConfigData` - Model configuration interface
  - `TestConnectionRequest` - Test connection request
  - `TestConnectionResponse` - Test connection response
- **API Functions**:
  - `modelConfigApi.get()` - Fetch configuration
  - `modelConfigApi.update()` - Update configuration
  - `modelConfigApi.test()` - Test connection

#### 2. useModelConfig Hook

Created React Query hook for model configuration:

- **File**: [`packages/client/src/hooks/useModelConfig.ts`](../packages/client/src/hooks/useModelConfig.ts)
- **Features**:
  - Fetches model configuration
  - Updates configuration with optimistic updates
  - Tests LLM connection
  - Toast notifications for success/error
  - Loading and error states

#### 3. ModelConfiguration Component

Created comprehensive configuration form:

- **File**: [`packages/client/src/components/ModelConfiguration.tsx`](../packages/client/src/components/ModelConfiguration.tsx)
- **Features**:
  - Provider selection dropdown (OpenRouter, OpenAI, Anthropic, Azure)
  - Masked API key inputs with show/hide toggle
  - Base URL configuration (optional)
  - Chat model selection
  - Embedding model selection
  - Reranker configuration (optional)
  - Test connection button
  - Save configuration button
  - Form validation
  - Loading states

#### 4. Settings Page Enhancement

Updated Settings page with tabbed interface:

- **File**: [`packages/client/src/pages/Settings.tsx`](../packages/client/src/pages/Settings.tsx)
- **Features**:
  - Tabbed navigation (Persona, Models)
  - Responsive tab layout
  - Tab descriptions
  - Smooth transitions

## Features Implemented

### ✅ LLM Configuration

- Provider selection (OpenRouter, OpenAI, Anthropic, Azure)
- API key input with masking
- Custom base URL support
- Chat model configuration
- Embedding model configuration
- Form validation

### ✅ Reranker Configuration

- Enable/disable toggle
- API key input with masking
- Base URL configuration
- Model selection
- Conditional rendering

### ✅ Security Features

- API key masking in UI
- API key masking in API responses
- Secure storage in MongoDB
- No plaintext API keys in logs
- Protected update logic (prevents overwriting with masked values)

### ✅ User Experience

- Show/hide password toggles
- Test connection functionality
- Real-time validation
- Toast notifications
- Loading states
- Error handling
- Last updated timestamp
- Auto-save on submit

### ✅ Provider Support

- OpenRouter (default)
- OpenAI
- Anthropic (Claude)
- Azure OpenAI
- Custom base URLs for any provider

## File Structure

```
packages/server/src/
├── models/
│   └── model-config.model.ts      # New: Model configuration schema
├── api/
│   └── config/
│       └── index.ts               # New: Config API endpoints
└── services/llm/
    ├── llm.service.ts             # Existing: LLM service
    └── providers.ts               # Existing: Provider factory

packages/client/src/
├── components/
│   └── ModelConfiguration.tsx     # New: Config form component
├── hooks/
│   └── useModelConfig.ts          # New: Config hook
├── pages/
│   └── Settings.tsx               # Updated: Added Models tab
└── lib/
    └── api.ts                     # Updated: Added config API
```

## API Endpoints

### GET /api/config/models

Get current model configuration with masked API keys.

**Response**:

```json
{
  "success": true,
  "data": {
    "llmProvider": "openrouter",
    "llmApiKey": "sk-o*********************vMgF",
    "llmBaseURL": "https://openrouter.ai/api/v1",
    "llmChatModel": "openai/gpt-4o-mini",
    "llmEmbeddingModel": "text-embedding-3-small",
    "rerankerEnabled": true,
    "rerankerApiKey": "xyz*********************abc",
    "rerankerBaseURL": "https://api.deepinfra.com/v1/inference",
    "rerankerModel": "Qwen/Qwen3-Reranker-8B",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### PUT /api/config/models

Update model configuration.

**Request**:

```json
{
  "llmProvider": "openrouter",
  "llmApiKey": "sk-or-v1-...",
  "llmBaseURL": "https://openrouter.ai/api/v1",
  "llmChatModel": "openai/gpt-4o-mini",
  "llmEmbeddingModel": "text-embedding-3-small",
  "rerankerEnabled": true
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    /* masked config */
  },
  "message": "Model configuration updated successfully"
}
```

### POST /api/config/models/test

Test LLM connection.

**Request**:

```json
{
  "llmProvider": "openrouter",
  "llmApiKey": "sk-or-v1-...",
  "llmBaseURL": "https://openrouter.ai/api/v1",
  "llmChatModel": "openai/gpt-4o-mini"
}
```

**Response**:

```json
{
  "success": true,
  "message": "Connection test successful",
  "data": {
    "response": "test successful",
    "model": "openai/gpt-4o-mini",
    "provider": "openrouter"
  }
}
```

## Testing Checklist

- [ ] Settings page loads successfully
- [ ] Models tab displays correctly
- [ ] Form loads with existing configuration
- [ ] Provider selection updates form
- [ ] API key masking works (show/hide)
- [ ] Save button updates configuration
- [ ] Toast notifications appear on save
- [ ] Test connection button works
- [ ] Test connection validates API key
- [ ] Reranker toggle shows/hides fields
- [ ] Form validation prevents invalid submissions
- [ ] Last updated timestamp displays
- [ ] Configuration persists across page refreshes
- [ ] API keys are properly masked in responses
- [ ] Multiple providers can be configured
- [ ] Base URL customization works

## Security Considerations

1. **API Key Masking**: API keys are masked in all UI displays and API responses
2. **Secure Storage**: API keys are stored in MongoDB (should be encrypted in production)
3. **Update Protection**: Masked API keys won't overwrite real keys during updates
4. **No Logging**: API keys are never logged to console or files
5. **HTTPS**: All API communication should use HTTPS in production

## Future Enhancements

1. **API Key Encryption**: Encrypt API keys in MongoDB
2. **Multiple Profiles**: Support multiple model configurations
3. **Cost Tracking**: Track API usage and costs
4. **Model Presets**: Pre-configured settings for popular models
5. **Auto-detection**: Automatically detect available models from provider
6. **Validation**: Validate model names against provider APIs
7. **Rate Limiting**: Configure rate limits per provider
8. **Fallback Models**: Configure fallback models if primary fails

## Known Limitations

1. **Single Configuration**: Only one model configuration is supported
2. **No Encryption**: API keys are stored in plaintext in MongoDB (should be encrypted)
3. **No Validation**: Model names are not validated against provider APIs
4. **No Auto-detection**: Available models are not automatically fetched
5. **Basic Masking**: API key masking is simple (first 4 + last 4 chars)

## Environment Variables

The following environment variables can be used as defaults:

```env
# LLM Configuration
LLM_PROVIDER=openrouter
LLM_API_KEY=sk-or-v1-...
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_CHAT_MODEL=openai/gpt-4o-mini
LLM_EMBEDDING_MODEL=text-embedding-3-small

# Reranker Configuration
RERANKER_ENABLED=true
RERANKER_API_KEY=...
RERANKER_BASE_URL=https://api.deepinfra.com/v1/inference
RERANKER_MODEL=Qwen/Qwen3-Reranker-8B
```

## Phase Completion

Phase 6 is complete with all deliverables implemented:

- ✅ Model configuration API endpoints
- ✅ Model configuration MongoDB storage
- ✅ ModelConfiguration component
- ✅ Provider selection (OpenRouter, OpenAI, Anthropic, Azure)
- ✅ API key masking and security
- ✅ Test connection feature
- ✅ Settings page with Models tab
- ✅ Toast notifications
- ✅ Form validation

## Related Documentation

- [Implementation Roadmap](./implementation-roadmap.md)
- [Phase 5 Implementation](./phase5-implementation.md) - Graph Schema Visualization
- [Phase 3 Implementation](./phase3-implementation.md) - MCP Server Management
