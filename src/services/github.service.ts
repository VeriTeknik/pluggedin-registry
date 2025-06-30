// import { App } from '@octokit/app';
import { Webhooks } from '@octokit/webhooks';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { Octokit } from '@octokit/rest';

export interface GitHubConfig {
  appId: string;
  privateKey: string;
  clientId: string;
  clientSecret: string;
  webhookSecret?: string;
}

export interface GitHubRepository {
  owner: string;
  repo: string;
  defaultBranch?: string;
}

export interface GitHubFile {
  path: string;
  content: string;
  encoding: string;
}

export interface McpConfigFile {
  name: string;
  description: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  transport?: 'stdio' | 'sse' | 'streamable-http';
  capabilities?: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
    logging?: boolean;
  };
}

class GitHubService {
  private octokit: Octokit;
  private webhooks?: Webhooks;
  private config: GitHubConfig;

  constructor(config: GitHubConfig) {
    this.config = config;
    
    // Use Octokit directly for public API access
    // Don't use client ID/secret auth as it has limited access
    this.octokit = new Octokit();

    if (config.webhookSecret) {
      this.webhooks = new Webhooks({
        secret: config.webhookSecret,
      });
    }
  }

  /**
   * Get an authenticated Octokit instance
   * Uses installation token if available, otherwise falls back to app auth
   */
  private async getOctokit(installationId?: number) {
    if (!installationId) {
      // For public repositories, use unauthenticated access
      // This avoids "Bad credentials" errors and works fine for public repos
      return new Octokit();
    }
    
    if (!this.config.appId || !this.config.privateKey) {
      // No app credentials, fall back to unauthenticated
      return new Octokit();
    }

    try {
      // Generate JWT for app authentication
      const jwt = this.generateAppJWT(this.config.privateKey, this.config.appId);
      
      // Create app-authenticated Octokit
      const appOctokit = new Octokit({
        auth: jwt,
      });

      // Get installation access token
      const { data } = await appOctokit.request('POST /app/installations/{installation_id}/access_tokens', {
        installation_id: installationId,
      });

      // Return Octokit authenticated with installation token
      return new Octokit({
        auth: data.token,
      });
    } catch (error) {
      logger.error('Failed to get installation token', { installationId, error });
      // Fall back to basic octokit
      return this.octokit;
    }
  }

  /**
   * Get the installation ID for a repository
   */
  async getInstallationId(repo: GitHubRepository): Promise<number | null> {
    try {
      const { data } = await this.octokit.request('GET /repos/{owner}/{repo}/installation', {
        owner: repo.owner,
        repo: repo.repo,
      });
      return data.id;
    } catch (error) {
      logger.error('Failed to get installation ID', { repo, error });
      return null;
    }
  }

  /**
   * Fetch a file from a GitHub repository
   */
  async getFile(repo: GitHubRepository, path: string, installationId?: number): Promise<GitHubFile | null> {
    try {
      const octokit = await this.getOctokit(installationId);
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: repo.owner,
        repo: repo.repo,
        path,
      });

      if (Array.isArray(data) || data.type !== 'file') {
        return null;
      }

      return {
        path: data.path,
        content: Buffer.from(data.content, 'base64').toString('utf-8'),
        encoding: data.encoding,
      };
    } catch (error: any) {
      if (error.status === 404) {
        logger.debug('File not found', { repo, path });
        return null;
      }
      logger.error('Failed to fetch file', { repo, path, error });
      return null;
    }
  }

  /**
   * List files in a directory
   */
  async listFiles(repo: GitHubRepository, path: string = '', installationId?: number): Promise<string[]> {
    try {
      const octokit = await this.getOctokit(installationId);
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner: repo.owner,
        repo: repo.repo,
        path,
      });

      if (!Array.isArray(data)) {
        return [];
      }

      return data
        .filter(item => item.type === 'file')
        .map(item => item.path);
    } catch (error) {
      logger.error('Failed to list files', { repo, path, error });
      return [];
    }
  }

  /**
   * Scan a repository for MCP configuration files
   */
  async scanForMcpConfig(repo: GitHubRepository, installationId?: number): Promise<McpConfigFile | null> {
    // Check for .mcp.json file
    const mcpJson = await this.getFile(repo, '.mcp.json', installationId);
    if (mcpJson) {
      try {
        return JSON.parse(mcpJson.content);
      } catch (error) {
        logger.error('Failed to parse .mcp.json', { repo, error });
      }
    }

    // Check for .well-known/mcp.json
    const wellKnownMcp = await this.getFile(repo, '.well-known/mcp.json', installationId);
    if (wellKnownMcp) {
      try {
        return JSON.parse(wellKnownMcp.content);
      } catch (error) {
        logger.error('Failed to parse .well-known/mcp.json', { repo, error });
      }
    }

    // If no config file found, we'll need to extract from README/package.json
    return null;
  }

  /**
   * Get repository metadata
   */
  async getRepositoryMetadata(repo: GitHubRepository, installationId?: number) {
    try {
      const octokit = await this.getOctokit(installationId);
      const { data } = await octokit.request('GET /repos/{owner}/{repo}', {
        owner: repo.owner,
        repo: repo.repo,
      });

      return {
        name: data.name,
        fullName: data.full_name,
        description: data.description,
        stars: data.stargazers_count,
        defaultBranch: data.default_branch,
        language: data.language,
        topics: data.topics,
        homepage: data.homepage,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        license: data.license?.spdx_id,
        private: data.private,
      };
    } catch (error) {
      logger.error('Failed to get repository metadata', { repo, error });
      throw error;
    }
  }

  /**
   * Get README content
   */
  async getReadme(repo: GitHubRepository, installationId?: number): Promise<string | null> {
    const readmeFiles = ['README.md', 'readme.md', 'README.MD', 'README', 'readme'];
    
    for (const filename of readmeFiles) {
      const file = await this.getFile(repo, filename, installationId);
      if (file) {
        return file.content;
      }
    }

    return null;
  }

  /**
   * Get package.json content
   */
  async getPackageJson(repo: GitHubRepository, installationId?: number): Promise<any | null> {
    const packageJson = await this.getFile(repo, 'package.json', installationId);
    if (packageJson) {
      try {
        return JSON.parse(packageJson.content);
      } catch (error) {
        logger.error('Failed to parse package.json', { repo, error });
      }
    }
    return null;
  }

  /**
   * Create a JWT for app authentication
   */
  generateAppJWT(privateKey: string, appId: string): string {
    const payload = {
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600, // 10 minutes
      iss: appId,
    };

    return jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
    });
  }

  /**
   * Verify webhook signature
   */
  async verifyWebhookSignature(payload: string, signature: string): Promise<boolean> {
    if (!this.webhooks) {
      throw new Error('Webhook secret not configured');
    }

    return await this.webhooks.verify(payload, signature);
  }

  /**
   * Handle webhook events
   */
  async handleWebhookEvent(eventName: string, payload: any) {
    logger.info('Received GitHub webhook', { eventName, repository: payload.repository?.full_name });

    switch (eventName) {
      case 'push':
        // Handle push events - check if MCP config changed
        if (payload.commits) {
          const configFiles = ['.mcp.json', '.well-known/mcp.json', 'README.md', 'package.json'];
          const hasConfigChange = payload.commits.some((commit: any) => 
            commit.added?.some((file: string) => configFiles.includes(file)) ||
            commit.modified?.some((file: string) => configFiles.includes(file))
          );

          if (hasConfigChange) {
            return {
              action: 'update_config',
              repository: {
                owner: payload.repository.owner.login,
                repo: payload.repository.name,
              },
            };
          }
        }
        break;

      case 'release':
        // Handle new releases
        if (payload.action === 'published') {
          return {
            action: 'new_release',
            repository: {
              owner: payload.repository.owner.login,
              repo: payload.repository.name,
            },
            release: {
              tag: payload.release.tag_name,
              name: payload.release.name,
              body: payload.release.body,
            },
          };
        }
        break;

      case 'repository':
        // Handle repository visibility changes
        if (payload.action === 'privatized' || payload.action === 'publicized') {
          return {
            action: 'visibility_change',
            repository: {
              owner: payload.repository.owner.login,
              repo: payload.repository.name,
            },
            visibility: payload.repository.private ? 'private' : 'public',
          };
        }
        break;
    }

    return null;
  }
}

// Export singleton instance
let githubService: GitHubService | null = null;

export function initializeGitHubService(config: GitHubConfig): GitHubService {
  githubService = new GitHubService(config);
  return githubService;
}

export function getGitHubService(): GitHubService {
  if (!githubService) {
    throw new Error('GitHub service not initialized');
  }
  return githubService;
}

export default GitHubService;