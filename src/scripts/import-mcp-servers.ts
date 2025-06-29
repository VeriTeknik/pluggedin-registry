import { config } from 'dotenv';
import { connectMongoDB } from '../services/mongodb';
import { initializeGitHubService, GitHubRepository } from '../services/github.service';
import { McpServer } from '../models';
import { McpServerSource } from '../models/types';
import { logger } from '../utils/logger';

// Load environment variables
config();

interface ServerDirectory {
  name: string;
  path: string;
  description?: string;
}

// Known MCP servers from the modelcontextprotocol/servers repository
const MCP_SERVERS: ServerDirectory[] = [
  {
    name: 'Everything Server',
    path: 'src/everything',
    description: 'Reference / test server with prompts, resources, and tools',
  },
  {
    name: 'Fetch Server',
    path: 'src/fetch',
    description: 'Web content fetching and conversion',
  },
  {
    name: 'Filesystem Server',
    path: 'src/filesystem',
    description: 'Secure file operations',
  },
  {
    name: 'Git Server',
    path: 'src/git',
    description: 'Repository management and operations',
  },
  {
    name: 'Memory Server',
    path: 'src/memory',
    description: 'Knowledge graph-based memory system',
  },
  {
    name: 'Postgres Server',
    path: 'src/postgres',
    description: 'PostgreSQL database operations',
  },
  {
    name: 'Sqlite Server',
    path: 'src/sqlite',
    description: 'SQLite database operations and management',
  },
  {
    name: 'Time Server',
    path: 'src/time',
    description: 'Time and timezone utilities',
  },
];

const OFFICIAL_REPO: GitHubRepository = {
  owner: 'modelcontextprotocol',
  repo: 'servers',
  defaultBranch: 'main',
};

async function importMcpServers() {
  try {
    // Connect to MongoDB
    await connectMongoDB();
    logger.info('Connected to MongoDB');

    // Initialize GitHub service
    const githubService = initializeGitHubService({
      appId: process.env.GITHUB_APP_ID!,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    });
    logger.info('Initialized GitHub service');

    // Get repository metadata
    const repoMetadata = await githubService.getRepositoryMetadata(OFFICIAL_REPO);
    logger.info('Fetched repository metadata', { stars: repoMetadata.stars });

    // Import each server
    for (const serverDir of MCP_SERVERS) {
      try {
        logger.info(`Importing ${serverDir.name}...`);

        // Check if server already exists
        const serverName = `mcp-server-${serverDir.name.toLowerCase().replace(/\s+/g, '-')}`;
        const existingServer = await McpServer.findOne({ 
          name: serverName,
          source: McpServerSource.GITHUB,
        });

        if (existingServer) {
          logger.info(`Server ${serverName} already exists, updating...`);
        }

        // Try to get package.json for this server
        const packageJsonPath = `${serverDir.path}/package.json`;
        const packageJson = await githubService.getFile(OFFICIAL_REPO, packageJsonPath);
        
        let packageData: any = {};
        if (packageJson) {
          try {
            packageData = JSON.parse(packageJson.content);
          } catch (error) {
            logger.error(`Failed to parse package.json for ${serverDir.name}`, { error });
          }
        }

        // Try to get README for this server
        const readmePath = `${serverDir.path}/README.md`;
        const readme = await githubService.getFile(OFFICIAL_REPO, readmePath);

        // Check for .mcp.json config
        const mcpConfig = await githubService.scanForMcpConfig({
          ...OFFICIAL_REPO,
          // Override path to check in subdirectory
          repo: `${OFFICIAL_REPO.repo}/${serverDir.path}`,
        });

        // Build server configuration
        const serverConfig = {
          name: serverName,
          description: serverDir.description || packageData.description || 'MCP server',
          source: McpServerSource.GITHUB,
          external_id: `${OFFICIAL_REPO.owner}/${OFFICIAL_REPO.repo}/${serverDir.path}`,
          repository: {
            url: `https://github.com/${OFFICIAL_REPO.owner}/${OFFICIAL_REPO.repo}`,
            source: 'github' as const,
            id: `${OFFICIAL_REPO.owner}/${OFFICIAL_REPO.repo}`,
            default_branch: repoMetadata.defaultBranch,
          },
          versions: [{
            version: packageData.version || '1.0.0',
            release_date: new Date(),
            is_latest: true,
            packages: packageData.name ? [{
              registry_name: 'npm' as const,
              name: packageData.name,
              version: packageData.version || '1.0.0',
            }] : [],
          }],
          capabilities: mcpConfig?.capabilities || {
            tools: serverDir.name.includes('tool'),
            resources: serverDir.name.includes('resource') || serverDir.name.includes('filesystem'),
            prompts: serverDir.name.includes('prompt'),
            logging: true,
          },
          metadata: {
            verified: true, // Official MCP servers are verified
            trust_score: 1,
            github_stars: repoMetadata.stars,
            tags: [
              'official',
              'mcp',
              serverDir.name.toLowerCase().replace(/\s+/g, '-'),
              ...(packageData.keywords || []),
            ],
            category: detectCategory(serverDir.name),
            last_scanned: new Date(),
            ai_extraction: readme ? {
              confidence_score: 0, // Will be updated when AI extraction is implemented
              extracted_at: new Date(),
              source_files: [readmePath, packageJsonPath].filter(Boolean),
              raw_config: mcpConfig,
            } : undefined,
          },
          // Command will be extracted from package.json or AI
          command: packageData.bin ? Object.keys(packageData.bin)[0] : undefined,
          args: extractArgsFromReadme(readme?.content),
          env: extractEnvFromReadme(readme?.content),
        };

        // Save or update server
        if (existingServer) {
          await McpServer.findByIdAndUpdate(existingServer._id, serverConfig);
          logger.info(`Updated ${serverName}`);
        } else {
          const newServer = new McpServer(serverConfig);
          await newServer.save();
          logger.info(`Created ${serverName}`);
        }

      } catch (error) {
        logger.error(`Failed to import ${serverDir.name}`, { error });
      }
    }

    logger.info('Import completed successfully');
  } catch (error) {
    logger.error('Import failed', { error });
    process.exit(1);
  }
}

function detectCategory(serverName: string): string {
  const name = serverName.toLowerCase();
  
  if (name.includes('database') || name.includes('postgres') || name.includes('sqlite')) {
    return 'database';
  }
  if (name.includes('filesystem') || name.includes('file')) {
    return 'storage';
  }
  if (name.includes('git') || name.includes('github')) {
    return 'development';
  }
  if (name.includes('fetch') || name.includes('web')) {
    return 'web';
  }
  if (name.includes('time') || name.includes('date')) {
    return 'utilities';
  }
  if (name.includes('memory') || name.includes('knowledge')) {
    return 'ai';
  }
  
  return 'general';
}

function extractArgsFromReadme(readme?: string): string[] | undefined {
  if (!readme) return undefined;
  
  // Simple pattern matching for command line arguments
  // This will be replaced by AI extraction later
  const argMatches = readme.match(/--?\w+(?:=\S+)?/g);
  return argMatches ? Array.from(new Set(argMatches)) : undefined;
}

function extractEnvFromReadme(readme?: string): Record<string, string> | undefined {
  if (!readme) return undefined;
  
  // Simple pattern matching for environment variables
  // This will be replaced by AI extraction later
  const envMatches = readme.match(/[A-Z_]+(?:_[A-Z]+)*(?=\s*=)/g);
  if (!envMatches) return undefined;
  
  const env: Record<string, string> = {};
  envMatches.forEach(varName => {
    env[varName] = '';
  });
  
  return Object.keys(env).length > 0 ? env : undefined;
}

// Run the import if called directly
if (require.main === module) {
  importMcpServers()
    .then(() => {
      logger.info('Import script completed');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Import script failed', { error });
      process.exit(1);
    });
}

export { importMcpServers };