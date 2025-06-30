import { Router, Request, Response, NextFunction } from 'express';
import { internalAuth } from '../../../middleware/internalAuth';
import { validateBody } from '../../../middleware/validation';
import { importRepositorySchema } from '../../../validation/schemas';
import { getGitHubService } from '../../../services/github.service';
import { aiExtractionService } from '../../../services/ai-extraction.service';
import { registryService } from '../../../services/registry.service';
import { logger } from '../../../utils/logger';
import { McpServerSource } from '../../../models/types';

const router = Router();

// Internal auth required for all routes
router.use(internalAuth);

/**
 * Import a GitHub repository
 * POST /api/v1/internal/import/repository
 */
router.post(
  '/repository',
  validateBody(importRepositorySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { repository_url } = req.body;
      const userId = req.headers['x-user-id'] as string;

      logger.info('Importing repository', { repository_url, userId });

      // Parse GitHub URL
      const repoInfo = parseGitHubUrl(repository_url);
      if (!repoInfo) {
        res.status(400).json({
          error: 'Invalid GitHub repository URL'
        });
        return;
      }

      // Check if server already exists
      const existingServer = await registryService.findServerByRepository(repository_url);
      if (existingServer) {
        logger.info('Server already exists', { 
          name: existingServer.name,
          id: existingServer.id 
        });
        
        res.json({
          message: 'Server already exists in registry',
          server: existingServer,
          is_new: false
        });
        return;
      }

      // Fetch repository content
      const githubService = getGitHubService();
      
      // Get repository metadata
      const metadata = await githubService.getRepositoryMetadata(repoInfo);
      
      // Get README content
      const readme = await githubService.getReadme(repoInfo);
      if (!readme) {
        res.status(404).json({
          error: 'No README found in repository'
        });
        return;
      }
      
      // Get package.json if exists
      const packageJson = await githubService.getPackageJson(repoInfo);
      
      // Check for .mcp.json
      const mcpConfig = await githubService.scanForMcpConfig(repoInfo);

      // Extract configuration using AI
      const extractionResult = await aiExtractionService.extractFromRepository(
        readme,
        packageJson,
        repository_url
      );

      // Validate extraction
      const validation = aiExtractionService.validateExtraction(extractionResult);
      if (!validation.isValid) {
        logger.warn('Extraction validation failed', { 
          errors: validation.errors,
          warnings: validation.warnings 
        });
      }

      // Merge with any existing .mcp.json config
      let finalConfig = extractionResult.extracted_config;
      if (mcpConfig) {
        finalConfig = aiExtractionService.mergeWithExisting(mcpConfig, finalConfig);
      }

      // If no config was extracted, create a minimal one
      if (!finalConfig || Object.keys(finalConfig).length === 0) {
        finalConfig = {
          name: metadata.name || repoInfo.repo,
          description: metadata.description || 'MCP server from GitHub',
          command: 'node',
          args: ['index.js'],
          env: {},
          capabilities: {
            tools: false,
            resources: false,
            prompts: false,
            logging: false
          }
        };
      }

      // Prepare server data
      // Ensure capabilities are in the correct format (Record<string, any> not boolean)
      const transformedCapabilities = {
        tools: {},
        resources: {},
        prompts: {},
        logging: {}
      };
      
      if (finalConfig.capabilities) {
        // If capabilities exist and have boolean values, transform them
        if (typeof finalConfig.capabilities.tools === 'boolean' && finalConfig.capabilities.tools) {
          transformedCapabilities.tools = { enabled: true };
        } else if (typeof finalConfig.capabilities.tools === 'object') {
          transformedCapabilities.tools = finalConfig.capabilities.tools;
        }
        
        if (typeof finalConfig.capabilities.resources === 'boolean' && finalConfig.capabilities.resources) {
          transformedCapabilities.resources = { enabled: true };
        } else if (typeof finalConfig.capabilities.resources === 'object') {
          transformedCapabilities.resources = finalConfig.capabilities.resources;
        }
        
        if (typeof finalConfig.capabilities.prompts === 'boolean' && finalConfig.capabilities.prompts) {
          transformedCapabilities.prompts = { enabled: true };
        } else if (typeof finalConfig.capabilities.prompts === 'object') {
          transformedCapabilities.prompts = finalConfig.capabilities.prompts;
        }
        
        if (typeof finalConfig.capabilities.logging === 'boolean' && finalConfig.capabilities.logging) {
          transformedCapabilities.logging = { enabled: true };
        } else if (typeof finalConfig.capabilities.logging === 'object') {
          transformedCapabilities.logging = finalConfig.capabilities.logging;
        }
      }
      
      // Transform env if it has rich metadata
      let transformedEnv: Record<string, string> | undefined;
      if (finalConfig.env) {
        transformedEnv = {};
        for (const [key, value] of Object.entries(finalConfig.env)) {
          if (typeof value === 'string') {
            transformedEnv[key] = value;
          } else if (typeof value === 'object' && value !== null && 'example' in value) {
            // Use example value if available
            transformedEnv[key] = (value as any).example || '';
          }
        }
      }
      
      const serverData = {
        name: finalConfig.name || metadata.name,
        description: finalConfig.description || metadata.description || 'MCP server',
        repository: {
          url: repository_url,
          source: 'github' as const,
          id: `${repoInfo.owner}/${repoInfo.repo}`,
          default_branch: metadata.defaultBranch
        },
        capabilities: transformedCapabilities,
        versions: [{
          version: packageJson?.version || '1.0.0',
          release_date: new Date(),
          is_latest: true
        }],
        command: finalConfig.command,
        args: finalConfig.args,
        env: transformedEnv,
        url: finalConfig.url,
        tags: [
          ...(metadata.topics || []),
          'imported',
          'unclaimed'
        ],
        category: detectCategory(finalConfig, metadata)
      };

      // Publish to registry (unclaimed)
      const result = await registryService.publishServer(serverData, userId);

      // Update with AI extraction metadata
      await registryService.updateServerMetadata(result.id, {
        github_stars: metadata.stars,
        ai_extraction: {
          confidence_score: extractionResult.confidence_scores.overall,
          extracted_at: new Date(),
          source_files: extractionResult.source_files,
          raw_config: extractionResult.extracted_config
        }
      });

      logger.info('Repository imported successfully', { 
        server_id: result.id,
        name: result.name 
      });

      res.status(201).json({
        message: 'Repository imported successfully',
        server: result,
        is_new: true,
        extraction: {
          confidence: extractionResult.confidence_scores,
          warnings: validation.warnings
        }
      });

    } catch (error) {
      next(error);
    }
  }
);

/**
 * Import from modelcontextprotocol/servers
 * POST /api/v1/internal/import/scan-official
 */
router.post(
  '/scan-official',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      
      logger.info('Scanning official MCP servers repository', { userId });

      // This endpoint triggers the import script
      // In production, this would be a background job
      res.json({
        message: 'Scan initiated',
        note: 'This would trigger a background job in production'
      });

    } catch (error) {
      next(error);
    }
  }
);

/**
 * Parse GitHub URL to extract owner and repo
 */
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname !== 'github.com') {
      return null;
    }
    
    const parts = urlObj.pathname.split('/').filter(p => p);
    if (parts.length >= 2) {
      return {
        owner: parts[0],
        repo: parts[1].replace(/\.git$/, '')
      };
    }
  } catch {
    // Invalid URL
  }
  
  return null;
}

/**
 * Detect category based on extracted config and metadata
 */
function detectCategory(config: any, metadata: any): string {
  const name = (config.name || metadata.name || '').toLowerCase();
  const description = (config.description || metadata.description || '').toLowerCase();
  const topics = metadata.topics || [];
  
  // Check name and description
  if (name.includes('database') || name.includes('sql') || 
      description.includes('database') || topics.includes('database')) {
    return 'database';
  }
  
  if (name.includes('api') || name.includes('http') || 
      description.includes('api') || topics.includes('api')) {
    return 'web';
  }
  
  if (name.includes('file') || name.includes('fs') || 
      description.includes('file') || topics.includes('filesystem')) {
    return 'storage';
  }
  
  if (name.includes('dev') || name.includes('git') || 
      description.includes('development') || topics.includes('development')) {
    return 'development';
  }
  
  if (name.includes('ai') || name.includes('llm') || 
      description.includes('ai') || topics.includes('ai')) {
    return 'ai';
  }
  
  return 'general';
}

export default router;