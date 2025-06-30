import { config } from 'dotenv';
import { connectMongoDB } from '../services/mongodb';
import { initializeGitHubService, GitHubRepository } from '../services/github.service';
import { aiExtractionService } from '../services/ai-extraction.service';
import { McpServer } from '../models';
import { McpServerSource } from '../models/types';
import { logger } from '../utils/logger';

// Load environment variables
config();

const OFFICIAL_REPO: GitHubRepository = {
  owner: 'modelcontextprotocol',
  repo: 'servers',
  defaultBranch: 'main',
};

interface RepositoryLink {
  url: string;
  name?: string;
  description?: string;
}

async function parseRepositoryLinks(readmeContent: string): Promise<RepositoryLink[]> {
  const links: RepositoryLink[] = [];
  
  // Match GitHub repository URLs in markdown
  // Pattern: [text](https://github.com/owner/repo)
  const linkPattern = /\[([^\]]+)\]\((https:\/\/github\.com\/[\w-]+\/[\w.-]+)\)/g;
  
  let match;
  while ((match = linkPattern.exec(readmeContent)) !== null) {
    const [, linkText, url] = match;
    
    // Skip the main modelcontextprotocol/servers repo itself
    if (url.includes('modelcontextprotocol/servers')) {
      continue;
    }
    
    links.push({
      url: url.replace(/\/$/, ''), // Remove trailing slash
      name: linkText,
      description: linkText,
    });
  }
  
  // Also match plain GitHub URLs
  const plainUrlPattern = /https:\/\/github\.com\/[\w-]+\/[\w.-]+/g;
  const plainMatches = readmeContent.match(plainUrlPattern) || [];
  
  for (const url of plainMatches) {
    // Skip if already found as a markdown link
    if (!links.some(link => link.url === url)) {
      links.push({
        url: url.replace(/\/$/, ''),
      });
    }
  }
  
  // Remove duplicates
  const uniqueLinks = Array.from(new Map(links.map(link => [link.url, link])).values());
  
  logger.info(`Found ${uniqueLinks.length} repository links`);
  return uniqueLinks;
}

async function importRepository(repoUrl: string, githubService: any): Promise<void> {
  try {
    logger.info(`Importing repository: ${repoUrl}`);
    
    // Parse repository info
    const urlParts = repoUrl.replace('https://github.com/', '').split('/');
    const repo: GitHubRepository = {
      owner: urlParts[0],
      repo: urlParts[1].replace(/\.git$/, ''),
    };
    
    // Check if server already exists
    const existingServer = await McpServer.findOne({
      'repository.url': repoUrl,
    });
    
    if (existingServer) {
      logger.info(`Server already exists: ${existingServer.name}`);
      return;
    }
    
    // Get repository metadata
    const metadata = await githubService.getRepositoryMetadata(repo);
    logger.info(`Repository: ${metadata.fullName} - ${metadata.description || 'No description'}`);
    
    // Get README
    const readme = await githubService.getReadme(repo);
    if (!readme) {
      logger.warn(`No README found for ${repoUrl}`);
      return;
    }
    
    // Get package.json
    const packageJson = await githubService.getPackageJson(repo);
    
    // Check for .mcp.json
    const mcpConfig = await githubService.scanForMcpConfig(repo);
    
    // Extract configuration using AI
    logger.info('Extracting configuration with AI...');
    const extractionResult = await aiExtractionService.extractFromRepository(
      readme,
      packageJson,
      repoUrl
    );
    
    // Validate extraction
    const validation = aiExtractionService.validateExtraction(extractionResult);
    if (validation.warnings.length > 0) {
      logger.warn('Extraction warnings:', validation.warnings);
    }
    
    // Merge with .mcp.json if exists
    let finalConfig = extractionResult.extracted_config;
    if (mcpConfig) {
      finalConfig = aiExtractionService.mergeWithExisting(mcpConfig, finalConfig);
    }
    
    // Create server document
    const serverData = {
      name: finalConfig.name || metadata.name,
      description: finalConfig.description || metadata.description || 'MCP server',
      source: McpServerSource.GITHUB,
      external_id: `${repo.owner}/${repo.repo}`,
      repository: {
        url: repoUrl,
        source: 'github' as const,
        id: `${repo.owner}/${repo.repo}`,
        default_branch: metadata.defaultBranch,
      },
      versions: [{
        version: packageJson?.version || '1.0.0',
        release_date: new Date(),
        is_latest: true,
        packages: packageJson?.name ? [{
          registry_name: 'npm' as const,
          name: packageJson.name,
          version: packageJson.version || '1.0.0',
        }] : [],
      }],
      capabilities: finalConfig.capabilities || {
        tools: false,
        resources: false,
        prompts: false,
        logging: false,
      },
      metadata: {
        verified: false,
        trust_score: 0,
        github_stars: metadata.stars,
        tags: [
          'official',
          'mcp',
          ...(metadata.topics || []),
        ],
        category: detectCategory(finalConfig, metadata),
        last_scanned: new Date(),
        ai_extraction: {
          confidence_score: extractionResult.confidence_scores.overall,
          extracted_at: new Date(),
          source_files: extractionResult.source_files,
          raw_config: extractionResult.extracted_config,
        },
      },
      command: finalConfig.command,
      args: finalConfig.args,
      env: finalConfig.env,
      url: finalConfig.url,
    };
    
    // Save to database
    const newServer = new McpServer(serverData);
    await newServer.save();
    
    logger.info(`Successfully imported: ${newServer.name}`);
    
  } catch (error) {
    logger.error(`Failed to import ${repoUrl}:`, error);
  }
}

function detectCategory(config: any, metadata: any): string {
  const name = (config.name || metadata.name || '').toLowerCase();
  const description = (config.description || metadata.description || '').toLowerCase();
  const topics = metadata.topics || [];
  
  if (name.includes('database') || name.includes('sql') || 
      description.includes('database') || topics.includes('database')) {
    return 'database';
  }
  
  if (name.includes('api') || name.includes('http') || 
      description.includes('api') || topics.includes('api')) {
    return 'web';
  }
  
  if (name.includes('file') || name.includes('fs') || 
      description.includes('filesystem') || topics.includes('filesystem')) {
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

async function importOfficialServers() {
  try {
    // Connect to MongoDB
    await connectMongoDB();
    logger.info('Connected to MongoDB');
    
    // Initialize GitHub service
    const githubService = initializeGitHubService({
      appId: process.env.GITHUB_APP_ID || '1',
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY || generateDummyPrivateKey(),
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    });
    logger.info('Initialized GitHub service');
    
    // Get README from official repo
    logger.info('Fetching README from modelcontextprotocol/servers...');
    const readme = await githubService.getReadme(OFFICIAL_REPO);
    
    if (!readme) {
      throw new Error('Could not fetch README from official repository');
    }
    
    // Parse repository links
    const repoLinks = await parseRepositoryLinks(readme);
    logger.info(`Found ${repoLinks.length} repositories to import`);
    
    // Import each repository
    for (let i = 0; i < repoLinks.length; i++) {
      const link = repoLinks[i];
      logger.info(`\n[${i + 1}/${repoLinks.length}] Processing ${link.url}`);
      
      await importRepository(link.url, githubService);
      
      // Add delay to avoid rate limiting
      if (i < repoLinks.length - 1) {
        logger.info('Waiting 2 seconds to avoid rate limiting...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    logger.info('\nImport completed successfully!');
    
  } catch (error) {
    logger.error('Import failed:', error);
    process.exit(1);
  }
}

// Helper function to generate dummy private key for development
function generateDummyPrivateKey(): string {
  return `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAwJyfSUKm3kJK3fX6Aw2tN/VW1TJ3Fe2jMg6NG7rNmJF7qohN
qoq0rBLfb7kcnmDiSvFz1Dk0ywxG+GjfCgzS7aZGu1otuQZvxqhf2adPVhLiLFdF
hmQnQivFTDVbKEtLHXipnvaWNVWFLKJ/fboKnjrXDqLPc9w4pZyYLnVq+rXdqNPh
rW7PbKkxVz1GhAmQFPgqQkUHlc7hCPJQKewYA1rHoNYPnSvTznQiZ9IAZX7Fe2XV
-----END RSA PRIVATE KEY-----`;
}

// Run the import if called directly
if (require.main === module) {
  importOfficialServers()
    .then(() => {
      logger.info('Import script completed');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Import script failed:', error);
      process.exit(1);
    });
}

export { importOfficialServers };