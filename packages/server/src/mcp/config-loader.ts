import { DataSourceModel } from '../models/data-source.model.js';
import logger from '../utils/logger.js';
import type { DataSource } from '../models/data-source.model.js';

/**
 * Load MCP proxy configuration from a file or environment variable
 */
export async function loadProxyConfig(): Promise<Array<DataSource & { _id: any }>> {
  const remoteServerConfigs = await DataSourceModel.find({
    isDisabled: false,
  });

  const validConfigs = remoteServerConfigs
    .filter((config) => {
      const error = validateConfig(config);
      if (error) {
        logger.error(
          { configName: config.name, error },
          `Invalid config for ${config.name}: ${error}`,
        );
        return false;
      }
      return true;
    })
    .map((doc) => {
      return doc;
    });

  return validConfigs;
}

/**
 * Validate MCP server configuration
 */
export function validateConfig(
  config: Pick<DataSource, 'name' | 'type' | 'command' | 'url'>,
): string | null {
  if (!config.name) {
    return 'Server name is required';
  }

  if (!config.type || !['stdio', 'sse', 'streamable-http'].includes(config.type)) {
    return "Server type must be 'stdio' or 'sse' or 'streamable-http'";
  }

  if (config.type === 'stdio' && !config.command) {
    return "stdio server requires 'command' field";
  }

  if (['sse', 'streamable-http'].includes(config.type) && !config.url) {
    return "sse server requires 'url' field";
  }

  return null;
}
