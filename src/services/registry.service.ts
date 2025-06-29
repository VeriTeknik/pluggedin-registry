import { McpServer, Publisher, IMcpServerDocument, IPublisherDocument } from '../models';
import { IMcpServer, IServerVersion, McpServerSource, IRepository } from '../models/types';
import { searchService } from './search.service';
import { logger } from '../utils/logger';
import { NotFoundError, UnauthorizedError, ConflictError } from '../middleware/errorHandler';

export interface PublishServerInput {
  name: string;
  description: string;
  repository: {
    url: string;
    source: string;
    id: string;
    default_branch?: string;
  };
  capabilities: {
    tools?: Record<string, any>;
    resources?: Record<string, any>;
    prompts?: Record<string, any>;
    logging?: Record<string, any>;
  };
  versions: IServerVersion[];
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  tags?: string[];
  category?: string;
}

export interface UpdateServerInput {
  description?: string;
  repository?: {
    url?: string;
    source?: string;
    id?: string;
    default_branch?: string;
  };
  capabilities?: {
    tools?: Record<string, any>;
    resources?: Record<string, any>;
    prompts?: Record<string, any>;
    logging?: Record<string, any>;
  };
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  tags?: string[];
  category?: string;
}

class RegistryService {
  /**
   * Publish a new MCP server to the registry
   */
  async publishServer(input: PublishServerInput, publisherId: string): Promise<IMcpServerDocument> {
    try {
      // For internal API, publisherId might be a pluggedin user ID
      // We'll skip publisher validation for now
      let publisher = null;
      try {
        publisher = await Publisher.findById(publisherId);
      } catch (err) {
        // If it's not a valid ObjectId, that's okay for internal API
        logger.debug('Publisher ID is not a MongoDB ObjectId, likely a pluggedin user ID', { publisherId });
      }

      // Check if server name already exists
      const existingServer = await McpServer.findOne({ name: input.name });
      if (existingServer) {
        throw new ConflictError(`Server with name '${input.name}' already exists`);
      }

      // Create external ID based on source
      const external_id = this.generateExternalId(input.repository.source, input.repository.id);

      // Create server document
      const server = new McpServer({
        name: input.name,
        description: input.description,
        source: McpServerSource.COMMUNITY,
        external_id,
        repository: input.repository,
        capabilities: input.capabilities,
        versions: input.versions.map((v, index) => ({
          ...v,
          is_latest: index === input.versions.length - 1,
        })),
        command: input.command,
        args: input.args,
        env: input.env,
        url: input.url,
        metadata: {
          verified: false,
          trust_score: 0,
          github_stars: 0,
          download_count: 0,
          install_count: 0,
          rating: 0,
          rating_count: 0,
          category: input.category || 'other',
          tags: input.tags || [],
          last_updated: new Date(),
        },
        ...(publisher && { publisher_id: publisherId }),
        created_at: new Date(),
      });

      // Save to database
      await server.save();

      // Index in Elasticsearch
      await searchService.indexServer(server);

      logger.info('Server published successfully', {
        serverId: server._id,
        name: server.name,
        publisherId,
      });

      return server;
    } catch (error) {
      logger.error('Error publishing server:', error);
      throw error;
    }
  }

  /**
   * Get a server by ID
   */
  async getServerById(serverId: string): Promise<IMcpServerDocument | null> {
    try {
      const server = await McpServer.findById(serverId).populate('publisher_id');
      return server;
    } catch (error) {
      logger.error('Error fetching server:', error);
      throw error;
    }
  }

  /**
   * Update a server
   */
  async updateServer(
    serverId: string,
    updates: UpdateServerInput,
    publisherId: string
  ): Promise<IMcpServerDocument> {
    try {
      // Find server and check ownership
      const server = await McpServer.findById(serverId);
      if (!server) {
        throw new NotFoundError('Server not found');
      }

      if (server.publisher_id?.toString() !== publisherId) {
        throw new UnauthorizedError('You are not authorized to update this server');
      }

      // Apply updates
      if (updates.description !== undefined) server.description = updates.description;
      if (updates.repository) {
        server.repository = { 
          ...server.repository,
          ...updates.repository 
        } as IRepository;
      }
      if (updates.capabilities) {
        server.capabilities = { ...server.capabilities, ...updates.capabilities };
      }
      if (updates.command !== undefined) server.command = updates.command;
      if (updates.args !== undefined) server.args = updates.args;
      if (updates.env !== undefined) server.env = updates.env;
      if (updates.url !== undefined) server.url = updates.url;
      if (updates.tags !== undefined) server.metadata.tags = updates.tags;
      if (updates.category !== undefined) server.metadata.category = updates.category;

      server.metadata.last_updated = new Date();

      // Save updates
      await server.save();

      // Re-index in Elasticsearch
      await searchService.indexServer(server);

      logger.info('Server updated successfully', {
        serverId: server._id,
        publisherId,
      });

      return server;
    } catch (error) {
      logger.error('Error updating server:', error);
      throw error;
    }
  }

  /**
   * Delete a server
   */
  async deleteServer(serverId: string, publisherId: string): Promise<void> {
    try {
      // Find server and check ownership
      const server = await McpServer.findById(serverId);
      if (!server) {
        throw new NotFoundError('Server not found');
      }

      if (server.publisher_id?.toString() !== publisherId) {
        throw new UnauthorizedError('You are not authorized to delete this server');
      }

      // Delete from MongoDB
      await server.deleteOne();

      // Delete from Elasticsearch
      await searchService.deleteServer(serverId);

      logger.info('Server deleted successfully', {
        serverId,
        name: server.name,
        publisherId,
      });
    } catch (error) {
      logger.error('Error deleting server:', error);
      throw error;
    }
  }

  /**
   * Add a new version to a server
   */
  async addVersion(
    serverId: string,
    version: IServerVersion,
    publisherId: string
  ): Promise<IMcpServerDocument> {
    try {
      // Find server and check ownership
      const server = await McpServer.findById(serverId);
      if (!server) {
        throw new NotFoundError('Server not found');
      }

      if (server.publisher_id?.toString() !== publisherId) {
        throw new UnauthorizedError('You are not authorized to update this server');
      }

      // Check if version already exists
      const existingVersion = server.versions.find(v => v.version === version.version);
      if (existingVersion) {
        throw new ConflictError(`Version ${version.version} already exists`);
      }

      // Mark all existing versions as not latest
      server.versions.forEach(v => {
        v.is_latest = false;
      });

      // Add new version as latest
      server.addVersion({
        ...version,
        is_latest: true,
      });

      // Update last_updated
      server.metadata.last_updated = new Date();

      // Save changes
      await server.save();

      // Re-index in Elasticsearch
      await searchService.indexServer(server);

      logger.info('Version added successfully', {
        serverId: server._id,
        version: version.version,
        publisherId,
      });

      return server;
    } catch (error) {
      logger.error('Error adding version:', error);
      throw error;
    }
  }

  /**
   * Get servers by publisher
   */
  async getServersByPublisher(publisherId: string): Promise<IMcpServerDocument[]> {
    try {
      const servers = await McpServer.find({ publisher_id: publisherId })
        .sort({ created_at: -1 });
      return servers;
    } catch (error) {
      logger.error('Error fetching servers by publisher:', error);
      throw error;
    }
  }

  /**
   * Update server verification status
   */
  async updateVerificationStatus(
    serverId: string,
    verified: boolean,
    verificationDetails?: any
  ): Promise<IMcpServerDocument> {
    try {
      const server = await McpServer.findById(serverId);
      if (!server) {
        throw new NotFoundError('Server not found');
      }

      server.metadata.verified = verified;
      // Store verification details separately if needed

      // Recalculate trust score
      server.metadata.trust_score = server.calculateTrustScore();

      await server.save();

      // Re-index in Elasticsearch
      await searchService.indexServer(server);

      logger.info('Server verification status updated', {
        serverId: server._id,
        verified,
      });

      return server;
    } catch (error) {
      logger.error('Error updating verification status:', error);
      throw error;
    }
  }

  /**
   * Increment install count
   */
  async incrementInstallCount(serverId: string): Promise<void> {
    try {
      await McpServer.findByIdAndUpdate(serverId, {
        $inc: { 'metadata.install_count': 1 },
      });

      logger.info('Install count incremented', { serverId });
    } catch (error) {
      logger.error('Error incrementing install count:', error);
      throw error;
    }
  }

  /**
   * Generate external ID based on source and repository ID
   */
  private generateExternalId(source: string, repoId: string): string {
    return `${source}:${repoId}`;
  }
}

export const registryService = new RegistryService();