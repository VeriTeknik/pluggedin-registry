import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../../../utils/logger';
import { searchService } from '../../../services/search.service';
import { getCachedData, setCachedData } from '../../../services/redis';
import { IMcpServerDocument } from '../../../models';

const router = Router();

/**
 * GET /api/v1/discover/featured
 * Get featured servers (curated list)
 */
router.get('/featured', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cacheKey = 'discover:featured';
    const cached = await getCachedData(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    // For now, return highly rated verified servers
    const results = await searchService.search({
      query: '',
      verified: true,
      sort: 'rating',
      limit: 10,
    });

    const featured = {
      servers: results.results.map(formatServerForDiscovery),
      updated_at: new Date(),
    };

    // Cache for 1 hour
    await setCachedData(cacheKey, featured, 3600);

    res.json(featured);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/discover/trending
 * Get trending servers (based on recent installs/stars)
 */
router.get('/trending', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cacheKey = 'discover:trending';
    const cached = await getCachedData(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    // Sort by download count as a proxy for trending
    const results = await searchService.search({
      query: '',
      sort: 'downloads',
      limit: 20,
    });

    const trending = {
      servers: results.results.map(formatServerForDiscovery),
      period: 'last_7_days',
      updated_at: new Date(),
    };

    // Cache for 30 minutes
    await setCachedData(cacheKey, trending, 1800);

    res.json(trending);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/discover/recent
 * Get recently added servers
 */
router.get('/recent', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const results = await searchService.search({
      query: '',
      sort: 'updated',
      limit: 20,
    });

    res.json({
      servers: results.results.map(formatServerForDiscovery),
      updated_at: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/discover/categories
 * Get servers grouped by category
 */
router.get('/categories', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cacheKey = 'discover:categories';
    const cached = await getCachedData(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    // Get aggregations from search
    const results = await searchService.search({
      query: '',
      limit: 0, // Only want aggregations
    });

    const categories = results.aggregations?.categories?.buckets?.map((bucket: any) => ({
      name: bucket.key,
      count: bucket.doc_count,
    })) || [];

    const response = {
      categories,
      total: categories.length,
      updated_at: new Date(),
    };

    // Cache for 1 hour
    await setCachedData(cacheKey, response, 3600);

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/discover/stats
 * Get registry statistics
 */
router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cacheKey = 'discover:stats';
    const cached = await getCachedData(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    // Get total count
    const allServers = await searchService.search({
      query: '',
      limit: 0,
    });

    const verifiedServers = await searchService.search({
      query: '',
      verified: true,
      limit: 0,
    });

    const stats = {
      total_servers: allServers.total,
      verified_servers: verifiedServers.total,
      categories: allServers.aggregations?.categories?.buckets?.length || 0,
      sources: allServers.aggregations?.sources?.buckets || [],
      updated_at: new Date(),
    };

    // Cache for 1 hour
    await setCachedData(cacheKey, stats, 3600);

    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// Helper function to format server for discovery endpoints
function formatServerForDiscovery(server: IMcpServerDocument) {
  return {
    id: server._id,
    name: server.name,
    description: server.description,
    source: server.source,
    repository: server.repository?.url,
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
    },
    latest_version: server.getLatestVersion()?.version,
    is_claimed: !!server.claimed_by,
  };
}

export default router;