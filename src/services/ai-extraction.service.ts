import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger';
import { getRedisClient } from './redis';

export interface ExtractedConfig {
  name?: string;
  description?: string;
  command?: string;
  args?: string[];
  env?: Array<{
    name: string;
    description: string;
    required: boolean;
    example: string;
    default?: string;
    help_url?: string;
  }>;
  installation?: {
    npm?: string;
    pip?: string;
    docker?: string;
    binary?: string;
    source?: string;
  };
  capabilities?: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
    logging?: boolean;
  };
  transport?: {
    type: 'stdio' | 'http' | 'sse';
    config?: any;
  };
  url?: string;
  repository?: {
    url: string;
    source: string;
    id: string;
  };
  packages?: Array<{
    registry_name: string;
    name: string;
    version: string;
    package_arguments: string[];
    environment_variables: any[];
  }>;
  requirements?: {
    runtime: string;
    version?: string;
    dependencies?: string[];
  };
  version_detail?: {
    version: string;
    release_date: string;
    is_latest: boolean;
  };
}

export interface ExtractionResult {
  server_detail?: ExtractedConfig;
  extracted_config?: ExtractedConfig; // For backward compatibility
  confidence_scores: {
    overall: number;
    completeness: number;
  };
  source_files?: string[];
  extraction_metadata?: {
    extracted_at: string;
    model: string;
    sources: string[];
  };
}

class AIExtractionService {
  private pythonScript: string;
  private cachePrefix = 'ai_extraction:';
  private cacheTTL = 7 * 24 * 60 * 60; // 7 days

  constructor() {
    this.pythonScript = path.join(__dirname, '..', 'scripts', 'extract_config.py');
  }

  /**
   * Extract MCP configuration from README and package.json using AI
   */
  async extractConfiguration(
    readmeContent: string,
    packageJson?: any,
    options?: {
      useCache?: boolean;
      cacheKey?: string;
      repoUrl?: string;
      codeFiles?: Array<{ filename: string; content: string }>;
    }
  ): Promise<ExtractionResult> {
    const { useCache = true, cacheKey } = options || {};

    // Check cache if enabled
    if (useCache && cacheKey) {
      const cached = await this.getFromCache(cacheKey);
      if (cached) {
        logger.info('Using cached AI extraction', { cacheKey });
        return cached;
      }
    }

    try {
      // Create temporary files
      const tmpDir = await fs.mkdtemp('/tmp/mcp-extract-');
      const readmePath = path.join(tmpDir, 'README.md');
      await fs.writeFile(readmePath, readmeContent, 'utf-8');

      const args = ['--readme', readmePath];
      
      if (packageJson) {
        const packagePath = path.join(tmpDir, 'package.json');
        await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2), 'utf-8');
        args.push('--package-json', packagePath);
      }

      if (options?.repoUrl) {
        args.push('--repo-url', options.repoUrl);
      }

      if (options?.codeFiles && options.codeFiles.length > 0) {
        const codeDir = path.join(tmpDir, 'code');
        await fs.mkdir(codeDir, { recursive: true });
        
        for (const file of options.codeFiles) {
          const filePath = path.join(codeDir, file.filename);
          await fs.writeFile(filePath, file.content, 'utf-8');
        }
        
        args.push('--code-dir', codeDir);
      }

      // Run Python extraction script
      const result = await this.runPythonScript(args);

      // Clean up temporary files
      await fs.rm(tmpDir, { recursive: true, force: true });

      // Cache result if enabled
      if (useCache && cacheKey) {
        await this.saveToCache(cacheKey, result);
      }

      return result;
    } catch (error) {
      logger.error('AI extraction failed', { error });
      throw error;
    }
  }

  /**
   * Extract configuration from a GitHub repository
   */
  async extractFromRepository(
    readmeContent: string,
    packageJson?: any,
    repoUrl?: string,
    codeFiles?: Array<{ filename: string; content: string }>
  ): Promise<ExtractionResult> {
    const cacheKey = repoUrl ? `repo:${repoUrl}` : undefined;
    
    return this.extractConfiguration(readmeContent, packageJson, {
      useCache: true,
      cacheKey,
      repoUrl,
      codeFiles
    });
  }

  /**
   * Run the Python extraction script
   */
  private runPythonScript(args: string[]): Promise<ExtractionResult> {
    return new Promise((resolve, reject) => {
      const python = spawn('python3', [this.pythonScript, ...args]);
      
      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          logger.error('Python script failed', { code, stderr });
          reject(new Error(`Python script exited with code ${code}: ${stderr}`));
        } else {
          try {
            // Extract JSON from output, handling contextgem logging
            // Find the last occurrence of a JSON object in the output
            const lines = stdout.split('\n');
            let jsonStr = '';
            let braceCount = 0;
            let inJson = false;
            
            // Scan from the end to find complete JSON
            for (let i = lines.length - 1; i >= 0; i--) {
              const line = lines[i];
              if (line.includes('}')) {
                inJson = true;
              }
              if (inJson) {
                jsonStr = line + '\n' + jsonStr;
                braceCount += (line.match(/\{/g) || []).length;
                braceCount -= (line.match(/\}/g) || []).length;
                if (braceCount === 0 && jsonStr.trim().startsWith('{')) {
                  break;
                }
              }
            }
            
            if (jsonStr.trim()) {
              const result = JSON.parse(jsonStr.trim());
              resolve(result);
            } else {
              throw new Error('No JSON found in output');
            }
          } catch (error) {
            logger.error('Failed to parse Python output', { stdout, error });
            reject(new Error('Failed to parse extraction result'));
          }
        }
      });

      python.on('error', (error) => {
        logger.error('Failed to spawn Python process', { error });
        reject(error);
      });
    });
  }

  /**
   * Get cached extraction result
   */
  private async getFromCache(key: string): Promise<ExtractionResult | null> {
    try {
      const redis = getRedisClient();
      const cached = await redis.get(`${this.cachePrefix}${key}`);
      
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.error('Cache retrieval failed', { key, error });
    }
    
    return null;
  }

  /**
   * Save extraction result to cache
   */
  private async saveToCache(key: string, result: ExtractionResult): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.setEx(
        `${this.cachePrefix}${key}`,
        this.cacheTTL,
        JSON.stringify(result)
      );
    } catch (error) {
      logger.error('Cache save failed', { key, error });
    }
  }

  /**
   * Validate extracted configuration
   */
  validateExtraction(result: ExtractionResult): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const config = result.server_detail || result.extracted_config;

    if (!config) {
      errors.push('No configuration extracted');
      return { isValid: false, errors, warnings };
    }

    // Required fields
    if (!config.name) {
      errors.push('Missing server name');
    }
    if (!config.description) {
      errors.push('Missing server description');
    }

    // Command or URL required
    if (!config.command && !config.url) {
      errors.push('Either command or URL must be specified');
    }

    // Validate transport
    if (config.url && !config.transport) {
      warnings.push('URL specified but transport not set, defaulting to streamable-http');
    }

    // Validate environment variables
    if (config.env) {
      if (Array.isArray(config.env)) {
        // New array format
        for (const env of config.env) {
          if (!env.description) {
            warnings.push(`Environment variable ${env.name} missing description`);
          }
        }
      } else {
        // Legacy object format
        for (const [key, value] of Object.entries(config.env)) {
          if (!value.description) {
            warnings.push(`Environment variable ${key} missing description`);
          }
        }
      }
    }

    // Check confidence scores
    if (result.confidence_scores.overall < 0.5) {
      warnings.push('Low confidence extraction, manual review recommended');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Merge AI extraction with existing configuration
   */
  mergeWithExisting(
    existing: any,
    extracted: ExtractedConfig
  ): ExtractedConfig {
    // Start with existing config
    const merged = { ...existing };

    // Override with extracted values if they have higher confidence
    if (extracted.name && !existing.name) {
      merged.name = extracted.name;
    }
    if (extracted.description && (!existing.description || existing.description.length < extracted.description.length)) {
      merged.description = extracted.description;
    }
    if (extracted.command && !existing.command) {
      merged.command = extracted.command;
    }
    if (extracted.args && extracted.args.length > 0) {
      merged.args = [...new Set([...(existing.args || []), ...extracted.args])];
    }
    if (extracted.env) {
      if (Array.isArray(extracted.env)) {
        // New array format - merge by name
        const existingEnvMap = new Map();
        if (Array.isArray(existing.env)) {
          existing.env.forEach((env: any) => existingEnvMap.set(env.name, env));
        }
        extracted.env.forEach(env => {
          if (!existingEnvMap.has(env.name)) {
            existingEnvMap.set(env.name, env);
          }
        });
        merged.env = Array.from(existingEnvMap.values());
      } else {
        // Legacy object format
        merged.env = { ...(existing.env || {}), ...extracted.env };
      }
    }
    if (extracted.capabilities) {
      merged.capabilities = { ...(existing.capabilities || {}), ...extracted.capabilities };
    }
    if (extracted.transport) {
      merged.transport = extracted.transport;
    }
    if (extracted.installation) {
      merged.installation = { ...(existing.installation || {}), ...extracted.installation };
    }
    if (extracted.requirements) {
      merged.requirements = { ...(existing.requirements || {}), ...extracted.requirements };
    }
    if (extracted.packages && extracted.packages.length > 0) {
      merged.packages = extracted.packages;
    }

    return merged;
  }
}

// Export singleton instance
export const aiExtractionService = new AIExtractionService();