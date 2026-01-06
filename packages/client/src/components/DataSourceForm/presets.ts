import { Settings } from "lucide-react";

export interface EnvVariable {
  key: string;
  label: string;
  placeholder: string;
  helpText: string;
  type: "text" | "password";
  validation?: RegExp;
  validationMessage?: string;
}

export interface HeaderVariable {
  key: string;
  label: string;
  value: string;
  helpText: string;
  editable?: boolean;
}

export interface ServicePreset {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon: typeof Settings;
  type: "stdio" | "sse" | "streamable-http";
  command?: string;
  args?: string[];
  url?: string;
  requiredEnv?: EnvVariable[];
  optionalEnv?: EnvVariable[];
  requiredHeaders?: HeaderVariable[];
  optionalHeaders?: HeaderVariable[];
  documentation: string;
  authGuide: string;
  setupSteps: string[];
  comingSoon?: boolean;
}

export const CUSTOM_PRESET: ServicePreset = {
  id: "custom",
  name: "custom",
  displayName: "Custom Server",
  description: "Configure a custom MCP server with advanced options",
  icon: Settings,
  type: "stdio",
  command: "",
  args: [],
  requiredEnv: [],
  documentation: "https://modelcontextprotocol.io/docs",
  authGuide: "",
  setupSteps: [
    "Choose the server type (STDIO, SSE, or Streamable HTTP)",
    "Enter the command and arguments for STDIO servers",
    "Or enter the URL for SSE/HTTP servers",
    "Add any required environment variables or headers",
    "Test the connection and save",
  ],
};

export function getPresetById(id: string): ServicePreset | undefined {
  const lowerId = id.toLowerCase();
  if (lowerId === "custom") return CUSTOM_PRESET;
  return undefined;
}

export function getAllPresets(): ServicePreset[] {
  return [CUSTOM_PRESET];
}

export function getAvailablePresets(): ServicePreset[] {
  return [CUSTOM_PRESET];
}
