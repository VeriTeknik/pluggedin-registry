import { Router, Request, Response, NextFunction } from 'express';
import { searchRateLimiter } from '../../middleware/rateLimiter';
import { ValidationError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { searchService } from '../../services/search.service';
import { McpServerSource } from '../../models';

const router = Router();

// Apply rate limiting to search endpoints
router.use(searchRateLimiter);

/**
 * GET /api/v1/search
 * Search for MCP servers
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      q = '',
      category,
      verified,
      source,
      offset = '0',
      limit = '20',
      sort = 'relevance',
    } = req.query;

    // Validate parameters
    const offsetNum = parseInt(offset as string);
    const limitNum = parseInt(limit as string);

    if (isNaN(offsetNum) || offsetNum < 0) {
      throw new ValidationError('Invalid offset parameter');
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new ValidationError('Invalid limit parameter (must be 1-100)');
    }

    // Validate source parameter
    if (source && !Object.values(McpServerSource).includes(source as McpServerSource)) {
      throw new ValidationError('Invalid source parameter');
    }

    // Validate sort parameter
    const validSorts = ['relevance', 'stars', 'downloads', 'rating', 'updated'];
    if (sort && !validSorts.includes(sort as string)) {
      throw new ValidationError('Invalid sort parameter');
    }

    logger.info('Search request:', {
      query: q,
      filters: { category, verified, source },
      pagination: { offset: offsetNum, limit: limitNum },
      sort,
    });

    // Perform search
    const searchResults = await searchService.search({
      query: q as string,
      category: category as string,
      verified: verified === 'true',
      source: source as McpServerSource,
      offset: offsetNum,
      limit: limitNum,
      sort: sort as any,
    });

    // Transform results for API response
    const response = {
      results: searchResults.results.map(server => ({
        id: server._id,
        name: server.name,
        description: server.description,
        source: server.source,
        external_id: server.external_id,
        repository: server.repository,
        metadata: {
          verified: server.metadata.verified,
          trust_score: server.metadata.trust_score,
          github_stars: server.metadata.github_stars,
          download_count: server.metadata.download_count,
          rating: server.metadata.rating,
          rating_count: server.metadata.rating_count,
          category: server.metadata.category,
          tags: server.metadata.tags,
        },
        latest_version: server.getLatestVersion(),
        command: server.command,
        url: server.url,
      })),
      total: searchResults.total,
      offset: searchResults.offset,
      limit: searchResults.limit,
      took: searchResults.took,
      aggregations: searchResults.aggregations,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/search/suggestions
 * Get search suggestions based on partial query
 */
router.get('/suggestions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q = '' } = req.query;

    if (!q || (q as string).length < 2) {
      throw new ValidationError('Query must be at least 2 characters');
    }

    const suggestions = await searchService.getSuggestions(q as string);
    res.json({ suggestions });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/search/facets
 * Get available search facets/filters
 */
router.get('/facets', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Perform a search to get aggregations
    const searchResults = await searchService.search({
      query: '',
      limit: 0, // We only want aggregations
    });

    const facets = {
      categories: searchResults.aggregations?.categories?.buckets || [],
      sources: searchResults.aggregations?.sources?.buckets || [],
      tags: searchResults.aggregations?.tags?.buckets || [],
    };

    res.json({ facets });
  } catch (error) {
    next(error);
  }
});

export default router;