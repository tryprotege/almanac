import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { IndexingConfig } from '@almanac/indexing-engine';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface PresetVariable {
  key: string;
  label: string;
  type: 'text' | 'password';
  required: boolean;
  helpText?: string;
}

export interface PresetConnection {
  type: 'stdio' | 'sse' | 'streamable-http';
  command?: string;
  args?: string[];
  url?: string;
  auth?: {
    type: 'oauth' | 'api-key';
    provider?: string;
  };
}

export interface DataSourcePreset {
  id: string;
  displayName: string;
  description: string;
  icon: string;
  category: string;
  connection: PresetConnection;
  variables: PresetVariable[];
  indexingConfig: IndexingConfig;
}

export interface PresetSummary {
  id: string;
  displayName: string;
  description: string;
  icon: string;
  category: string;
  connectionType: string;
  authType?: string;
  variables: PresetVariable[];
  hasIndexingConfig: boolean;
}

class PresetLoaderService {
  private presets: Map<string, DataSourcePreset> = new Map();
  private loaded = false;

  /**
   * Load all presets from the data-sources-config directory at startup
   */
  async loadPresetsAtStartup(): Promise<void> {
    if (this.loaded) {
      console.log('[PresetLoader] Presets already loaded, skipping');
      return;
    }

    try {
      // Resolve path relative to this file
      // When compiled, this file is at: dist/services/presets/preset-loader.service.js
      // So we need to go up 5 levels to reach the workspace root
      const presetsDir = path.resolve(__dirname, '../../../../../packages/data-sources-config');

      console.log(`[PresetLoader] Loading presets from: ${presetsDir}`);

      const files = await fs.readdir(presetsDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      console.log(`[PresetLoader] Found ${jsonFiles.length} preset files: ${jsonFiles.join(', ')}`);

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(presetsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const preset: DataSourcePreset = JSON.parse(content);

          // Validate preset structure
          if (!preset.id || !preset.displayName || !preset.connection) {
            console.warn(`[PresetLoader] Skipping invalid preset ${file}: missing required fields`);
            continue;
          }

          this.presets.set(preset.id, preset);
          console.log(`[PresetLoader] ✓ Loaded preset: ${preset.displayName} (${preset.id})`);
        } catch (error) {
          console.error(`[PresetLoader] Failed to load preset ${file}:`, error);
        }
      }

      this.loaded = true;
      console.log(`[PresetLoader] Successfully loaded ${this.presets.size} presets`);
    } catch (error) {
      console.error('[PresetLoader] Failed to load presets:', error);
      throw error;
    }
  }

  /**
   * Get a specific preset by ID
   */
  getPreset(id: string): DataSourcePreset | undefined {
    return this.presets.get(id);
  }

  /**
   * Get all presets
   */
  getAllPresets(): DataSourcePreset[] {
    return Array.from(this.presets.values());
  }

  /**
   * Get preset summaries (without full indexing config)
   */
  getPresetSummaries(): PresetSummary[] {
    return Array.from(this.presets.values()).map((preset) => ({
      id: preset.id,
      displayName: preset.displayName,
      description: preset.description,
      icon: preset.icon,
      category: preset.category,
      connectionType: preset.connection.type,
      authType: preset.connection.auth?.type,
      variables: preset.variables,
      hasIndexingConfig: true,
    }));
  }

  /**
   * Check if a preset exists
   */
  hasPreset(id: string): boolean {
    return this.presets.has(id);
  }

  /**
   * Get the number of loaded presets
   */
  getPresetCount(): number {
    return this.presets.size;
  }
}

// Export singleton instance
export const presetLoader = new PresetLoaderService();
