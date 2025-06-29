import { Router, Request, Response, NextFunction } from 'express';
import { validateParams } from '../../../middleware/validation';
import { logger } from '../../../utils/logger';
import { registryService } from '../../../services/registry.service';
import { serverIdSchema } from '../../../validation/schemas';
import { getCachedData, setCachedData } from '../../../services/redis';

const router = Router();

/**
 * GET /api/v1/servers/:id
 * Get public server details (no auth required)
 */
router.get('/:id', validateParams(serverIdSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    // Check cache first
    const cacheKey = `server:${id}`;
    const cached = await getCachedData(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    // Fetch server
    const server = await registryService.getServerById(id);
    
    if (!server) {
      res.status(404).json({
        error: 'Server not found',
      });
      return;
    }

    // Transform for public API (hide sensitive data)
    const publicServer = {
      id: server._id,
      name: server.name,
      description: server.description,
      source: server.source,
      external_id: server.external_id,
      repository: server.repository,
      capabilities: server.capabilities,
      versions: server.versions,
      command: server.command,
      args: server.args,
      url: server.url,
      metadata: {
        verified: server.metadata.verified,
        trust_score: server.metadata.trust_score,
        github_stars: server.metadata.github_stars,
        download_count: server.metadata.download_count,
        install_count: server.metadata.install_count,
        rating: server.metadata.rating,
        rating_count: server.metadata.rating_count,
        category: server.metadata.category,
        tags: server.metadata.tags,
        last_updated: server.metadata.last_updated,
      },
      // Show claim status but not who claimed it
      is_claimed: !!server.claimed_by,
      claimed_at: server.claimed_at,
      created_at: server.created_at,
      updated_at: server.updated_at,
    };

    // Cache for 5 minutes
    await setCachedData(cacheKey, publicServer, 300);

    res.json(publicServer);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/servers
 * List recent servers (no auth required)
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const sort = req.query.sort as string || 'created_at';

    // For now, use search service
    const { searchService } = await import('../../../services/search.service');
    const results = await searchService.search({
      query: '',
      limit,
      offset,
      sort: sort as any,
    });

    res.json({
      servers: results.results.map(server => ({
        id: server._id,
        name: server.name,
        description: server.description,
        source: server.source,
        metadata: {
          verified: server.metadata.verified,
          trust_score: server.metadata.trust_score,
          category: server.metadata.category,
          tags: server.metadata.tags,
        },
        latest_version: server.getLatestVersion(),
      })),
      total: results.total,
      offset: results.offset,
      limit: results.limit,
    });
  } catch (error) {
    next(error);
  }
});

export default router;