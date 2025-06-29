import { Client } from '@elastic/elasticsearch';
import { logger } from '../utils/logger';

let esClient: Client;

export async function connectElasticsearch(): Promise<void> {
  const url = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
  
  esClient = new Client({
    node: url,
    maxRetries: 5,
    requestTimeout: 60000,
    sniffOnStart: false,
  });
  
  try {
    // Test the connection
    await esClient.ping();
    
    // Create indices if they don't exist
    await createIndices();
  } catch (error) {
    logger.error('Failed to connect to Elasticsearch:', error);
    throw error;
  }
}

async function createIndices(): Promise<void> {
  const indexPrefix = process.env.ELASTICSEARCH_INDEX_PREFIX || 'mcp_';
  const serversIndex = `${indexPrefix}servers`;
  
  try {
    const indexExists = await esClient.indices.exists({ index: serversIndex });
    
    if (!indexExists) {
      await esClient.indices.create({
        index: serversIndex,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            analysis: {
              analyzer: {
                mcp_analyzer: {
                  type: 'standard',
                  stopwords: '_english_',
                },
              },
            },
          },
          mappings: {
            properties: {
              name: { type: 'text', analyzer: 'mcp_analyzer' },
              description: { type: 'text', analyzer: 'mcp_analyzer' },
              tags: { type: 'keyword' },
              category: { type: 'keyword' },
              source: { type: 'keyword' },
              external_id: { type: 'keyword' },
              trust_score: { type: 'float' },
              github_stars: { type: 'integer' },
              download_count: { type: 'integer' },
              verified: { type: 'boolean' },
              capabilities: {
                type: 'nested',
                properties: {
                  tools: { type: 'object', enabled: false },
                  resources: { type: 'object', enabled: false },
                  prompts: { type: 'object', enabled: false },
                },
              },
              repository: {
                properties: {
                  url: { type: 'keyword' },
                  source: { type: 'keyword' },
                },
              },
              updated_at: { type: 'date' },
              created_at: { type: 'date' },
            },
          },
        },
      });
      
      logger.info(`Created Elasticsearch index: ${serversIndex}`);
    }
  } catch (error) {
    logger.error('Failed to create Elasticsearch indices:', error);
    throw error;
  }
}

export function getElasticsearchClient(): Client {
  if (!esClient) {
    throw new Error('Elasticsearch client not initialized');
  }
  return esClient;
}