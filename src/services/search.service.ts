import { Client } from '@elastic/elasticsearch';
import { getElasticsearchClient } from './elasticsearch';
import { getCachedData, setCachedData } from './redis';
import { McpServer, IMcpServerDocument, McpServerSource } from '../models';
import { logger } from '../utils/logger';

interface SearchQuery {
  query: string;
  category?: string;
  verified?: boolean;
  source?: McpServerSource;
  tags?: string[];
  offset?: number;
  limit?: number;
  sort?: 'relevance' | 'stars' | 'downloads' | 'rating' | 'updated';
}

interface SearchResult {
  results: IMcpServerDocument[];
  total: number;
  offset: number;
  limit: number;
  took: number;
  aggregations?: any;
}

export class SearchService {
  private esClient: Client | null = null;
  private indexName: string;

  constructor() {
    this.indexName = `${process.env.ELASTICSEARCH_INDEX_PREFIX || 'mcp_'}servers`;
  }

  private getClient(): Client {
    if (!this.esClient) {
      this.esClient = getElasticsearchClient();
    }
    return this.esClient;
  }

  /**
   * Search for MCP servers
   */
  async search(params: SearchQuery): Promise<SearchResult> {
    const {
      query = '',
      category,
      verified,
      source,
      tags,
      offset = 0,
      limit = 20,
      sort = 'relevance',
    } = params;

    // Generate cache key
    const cacheKey = this.generateCacheKey(params);
    
    // Check cache
    const cached = await getCachedData<SearchResult>(cacheKey);
    if (cached) {
      logger.debug('Search cache hit', { cacheKey });
      return cached;
    }

    try {
      // Build Elasticsearch query
      const esQuery = this.buildElasticsearchQuery(query, {
        category,
        verified,
        source,
        tags,
      });

      // Determine sort order
      const sortOrder = this.getSortOrder(sort);

      // Execute search
      const startTime = Date.now();
      const response = await this.getClient().search({
        index: this.indexName,
        body: {
          query: esQuery,
          sort: sortOrder,
          from: offset,
          size: limit,
          track_total_hits: true,
          aggs: {
            categories: {
              terms: { field: 'category', size: 20 },
            },
            sources: {
              terms: { field: 'source', size: 10 },
            },
            tags: {
              terms: { field: 'tags', size: 50 },
            },
          },
        },
      });

      const took = Date.now() - startTime;

      // Extract results
      const hits = response.hits.hits;
      const total = typeof response.hits.total === 'number' 
        ? response.hits.total 
        : response.hits.total?.value || 0;

      // Get full documents from MongoDB
      const serverIds = hits.map(hit => hit._id);
      const servers = await McpServer.find({ _id: { $in: serverIds } });

      // Preserve Elasticsearch order
      const serverMap = new Map(servers.map(s => [s._id?.toString() || '', s]));
      const orderedServers = serverIds
        .map(id => serverMap.get(id || ''))
        .filter(Boolean) as IMcpServerDocument[];

      const result: SearchResult = {
        results: orderedServers,
        total,
        offset,
        limit,
        took,
        aggregations: response.aggregations,
      };

      // Cache result
      await setCachedData(cacheKey, result, 300); // 5 minute cache

      return result;
    } catch (error) {
      logger.error('Search error:', error);
      throw error;
    }
  }

  /**
   * Index a server in Elasticsearch
   */
  async indexServer(server: IMcpServerDocument): Promise<void> {
    try {
      const latestVersion = server.getLatestVersion();
      
      const doc = {
        name: server.name,
        description: server.description,
        category: server.metadata.category,
        tags: server.metadata.tags || [],
        source: server.source,
        external_id: server.external_id,
        trust_score: server.metadata.trust_score,
        github_stars: server.metadata.github_stars || 0,
        download_count: server.metadata.download_count || 0,
        rating: server.metadata.rating || 0,
        verified: server.metadata.verified,
        repository: server.repository,
        version: latestVersion?.version,
        updated_at: server.updated_at,
        created_at: server.created_at,
      };

      await this.getClient().index({
        index: this.indexName,
        id: server._id?.toString() || '',
        body: doc,
        refresh: 'wait_for',
      });

      logger.debug('Indexed server in Elasticsearch', { serverId: server._id });
    } catch (error) {
      logger.error('Failed to index server:', error);
      throw error;
    }
  }

  /**
   * Remove a server from Elasticsearch index
   */
  async removeServer(serverId: string): Promise<void> {
    try {
      await this.getClient().delete({
        index: this.indexName,
        id: serverId,
        refresh: 'wait_for',
      });

      logger.debug('Removed server from Elasticsearch', { serverId });
    } catch (error) {
      logger.error('Failed to remove server from index:', error);
      throw error;
    }
  }

  /**
   * Get search suggestions
   */
  async getSuggestions(query: string): Promise<string[]> {
    try {
      const response = await this.getClient().search({
        index: this.indexName,
        body: {
          suggest: {
            name_suggest: {
              prefix: query,
              completion: {
                field: 'name.suggest',
                size: 10,
                skip_duplicates: true,
              },
            },
          },
        },
      });

      const suggestions = response.suggest?.name_suggest?.[0]?.options || [];
      return (suggestions as any[]).map((opt: any) => opt.text);
    } catch (error) {
      logger.error('Failed to get suggestions:', error);
      return [];
    }
  }

  /**
   * Build Elasticsearch query
   */
  private buildElasticsearchQuery(query: string, filters: any): any {
    const must: any[] = [];
    const filter: any[] = [];

    // Text search
    if (query) {
      must.push({
        multi_match: {
          query,
          fields: ['name^3', 'description^2', 'tags'],
          type: 'best_fields',
          fuzziness: 'AUTO',
        },
      });
    }

    // Apply filters
    if (filters.category) {
      filter.push({ term: { category: filters.category } });
    }

    if (filters.verified !== undefined) {
      filter.push({ term: { verified: filters.verified } });
    }

    if (filters.source) {
      filter.push({ term: { source: filters.source } });
    }

    if (filters.tags && filters.tags.length > 0) {
      filter.push({ terms: { tags: filters.tags } });
    }

    // Construct final query
    if (must.length === 0 && filter.length === 0) {
      return { match_all: {} };
    }

    return {
      bool: {
        ...(must.length > 0 && { must }),
        ...(filter.length > 0 && { filter }),
      },
    };
  }

  /**
   * Get sort order for Elasticsearch
   */
  private getSortOrder(sort: string): any[] {
    switch (sort) {
      case 'stars':
        return [{ github_stars: { order: 'desc' } }, '_score'];
      case 'downloads':
        return [{ download_count: { order: 'desc' } }, '_score'];
      case 'rating':
        return [{ rating: { order: 'desc' } }, '_score'];
      case 'updated':
        return [{ updated_at: { order: 'desc' } }, '_score'];
      case 'relevance':
      default:
        return ['_score', { trust_score: { order: 'desc' } }];
    }
  }

  /**
   * Generate cache key for search query
   */
  private generateCacheKey(params: SearchQuery): string {
    const key = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join('|');
    return `search:${key}`;
  }

  /**
   * Reindex all servers (for maintenance)
   */
  async reindexAll(): Promise<void> {
    logger.info('Starting full reindex');
    
    try {
      // Delete and recreate index
      await this.getClient().indices.delete({ index: this.indexName }).catch(() => {});
      await this.getClient().indices.create({
        index: this.indexName,
        body: {
          mappings: {
            properties: {
              name: { type: 'text', analyzer: 'standard' },
              description: { type: 'text', analyzer: 'standard' },
              category: { type: 'keyword' },
              tags: { type: 'keyword' },
              source: { type: 'keyword' },
              external_id: { type: 'keyword' },
              trust_score: { type: 'float' },
              github_stars: { type: 'integer' },
              download_count: { type: 'integer' },
              rating: { type: 'float' },
              verified: { type: 'boolean' },
              updated_at: { type: 'date' },
              created_at: { type: 'date' },
            },
          },
        },
      });

      // Index all servers
      const servers = await McpServer.find({});
      for (const server of servers) {
        if (server._id) {
          await this.indexServer(server);
        }
      }

      logger.info(`Reindexed ${servers.length} servers`);
    } catch (error) {
      logger.error('Reindex failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const searchService = new SearchService();