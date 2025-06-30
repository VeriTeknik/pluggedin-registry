import { Router } from 'express';
import { getGitHubService } from '../../../services/github.service';
import { aiExtractionService, ExtractedConfig } from '../../../services/ai-extraction.service';
import { logger } from '../../../utils/logger';
import { McpConfigFile } from '../../../services/github.service';

const router = Router();

interface ImportRequest {
  repository_url: string;
  installation_id?: string;
}

/**
 * Import a GitHub repository
 * POST /api/v1/internal/github/import
 */
router.post('/import', async (req, res) => {
  try {
    const { repository_url, installation_id } = req.body as ImportRequest;
    
    if (!repository_url) {
      return res.status(400).json({ error: 'Repository URL is required' });
    }

    // Parse GitHub URL
    const urlPattern = /^https:\/\/github\.com\/([\w-]+)\/([\w.-]+)\/?$/;
    const match = repository_url.match(urlPattern);
    
    if (!match) {
      return res.status(400).json({ error: 'Invalid GitHub repository URL' });
    }

    const [, owner, repo] = match;
    const githubService = getGitHubService();
    
    // Get repository metadata
    const repoData = await githubService.getRepositoryMetadata(
      { owner, repo },
      installation_id ? parseInt(installation_id) : undefined
    );

    // Check if it's a private repo and we don't have installation
    if (repoData.private && !installation_id) {
      return res.status(403).json({ 
        error: 'Private repository requires GitHub App installation' 
      });
    }

    // Scan for MCP configuration
    let mcpConfig: McpConfigFile | ExtractedConfig | null = await githubService.scanForMcpConfig(
      { owner, repo },
      installation_id ? parseInt(installation_id) : undefined
    );

    let extractionResult = null;
    let warnings: string[] = [];

    // If no MCP config found, use AI extraction
    if (!mcpConfig) {
      logger.info('No MCP config found, using AI extraction', { owner, repo });
      
      // Get README and package.json for AI analysis
      const readme = await githubService.getReadme(
        { owner, repo },
        installation_id ? parseInt(installation_id) : undefined
      );
      
      const packageJson = await githubService.getPackageJson(
        { owner, repo },
        installation_id ? parseInt(installation_id) : undefined
      );

      if (readme || packageJson) {
        extractionResult = await aiExtractionService.extractFromRepository(
          readme || '',
          packageJson || {},
          repository_url
        );

        if (extractionResult && extractionResult.extracted_config) {
          mcpConfig = extractionResult.extracted_config;
          
          // Validate extraction
          const validation = aiExtractionService.validateExtraction(extractionResult);
          warnings = validation.warnings;
          
          if (!validation.isValid) {
            warnings.push(...validation.errors);
          }
        }
      }
    }

    // Build server configuration
    const server = {
      name: mcpConfig?.name || repoData.name,
      description: mcpConfig?.description || repoData.description || '',
      repository: {
        url: repository_url,
        source: 'github',
        id: `${owner}/${repo}`,
      },
      command: mcpConfig?.command,
      args: mcpConfig?.args || [],
      env: mcpConfig?.env || {},
      url: mcpConfig?.url,
      transport: mcpConfig?.transport || 'stdio',
      capabilities: mcpConfig?.capabilities || {
        tools: false,
        resources: false,
        prompts: false,
        logging: false,
      },
      metadata: {
        stars: repoData.stars,
        language: repoData.language,
        topics: repoData.topics,
        license: repoData.license,
        homepage: repoData.homepage,
      },
    };

    // Return the extracted configuration
    res.json({
      server,
      extraction: extractionResult ? {
        confidence: extractionResult.confidence_scores || { overall: 0.5 },
        warnings,
      } : undefined,
      isNew: true,
    });
  } catch (error) {
    logger.error('Failed to import GitHub repository', { error });
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to import repository' 
    });
  }
  return; // Explicit return for TypeScript
});

export default router;