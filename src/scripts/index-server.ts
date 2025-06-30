import * as dotenv from 'dotenv';
dotenv.config();
import { connectMongoDB } from '../services/mongodb';
import { connectElasticsearch } from '../services/elasticsearch';
import { searchService } from '../services/search.service';
import { McpServer } from '../models/server.model';
import { logger } from '../utils/logger';

async function indexServer(serverId: string) {
  try {
    await connectMongoDB();
    await connectElasticsearch();
    
    const server = await McpServer.findById(serverId);
    if (!server) {
      logger.error('Server not found', { serverId });
      return;
    }
    
    await searchService.indexServer(server);
    logger.info('Server indexed successfully', { serverId, name: server.name });
    
    process.exit(0);
  } catch (error) {
    logger.error('Failed to index server', { error });
    process.exit(1);
  }
}

const serverId = process.argv[2];
if (!serverId) {
  console.error('Usage: npm run index-server <server-id>');
  process.exit(1);
}

indexServer(serverId);