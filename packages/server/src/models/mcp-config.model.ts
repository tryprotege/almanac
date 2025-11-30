import mongoose, { InferSchemaType } from "mongoose";
import { SourceType } from "../types/index.js";

// MCP Server Config Mongoose Schema
const MCPServerConfigSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      index: true,
      enum: ["notion", "slack", "calendar", "jira"] satisfies SourceType[],
    },
    type: { type: String, required: true, enum: ["stdio", "sse"] },
    command: { type: String },
    args: [{ type: String }],
    env: { type: Map, of: String },
    url: { type: String },
    headers: { type: Map, of: String },
    isDisabled: { type: Boolean, default: false },
  },
  {
    collection: "mcp_server_configs",
    timestamps: true,
  }
);

// Create indexes
MCPServerConfigSchema.index({ name: 1 }, { unique: true });

// Add validation for type-specific required fields
MCPServerConfigSchema.pre("save", function () {
  if (this.type === "stdio" && !this.command) {
    throw new Error("stdio server requires 'command' field");
  } else if (this.type === "sse" && !this.url) {
    throw new Error("sse server requires 'url' field");
  }
});

export type MCPServerConfig = InferSchemaType<typeof MCPServerConfigSchema>;

// Export the model
export const MCPServerConfigModel = mongoose.model<MCPServerConfig>(
  "MCPServerConfig",
  MCPServerConfigSchema
);
