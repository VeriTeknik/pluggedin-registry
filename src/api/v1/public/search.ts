import { Router, Request, Response, NextFunction } from 'express';
import { searchRateLimiter } from '../../../middleware/rateLimiter';
import { ValidationError } from '../../../middleware/errorHandler';
import { validateQuery } from '../../../middleware/validation';
import { logger } from '../../../utils/logger';
import { searchService } from '../../../services/search.service';
import { McpServerSource, IMcpServerDocument } from '../../../models';
import { searchQuerySchema, suggestionsQuerySchema } from '../../../validation/schemas';

const router = Router();

// Apply rate limiting to search endpoints
router.use(searchRateLimiter);

/**
 * GET /api/v1/search
 * Search for MCP servers
 */
router.get('/', validateQuery(searchQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validated query parameters are now available
    const {
      q,
      category,
      verified,
      source,
      offset,
      limit,
      sort,
      tags,
    } = req.query as any;

    logger.info('Search request:', {
      query: q,
      filters: { category, verified, source, tags },
      pagination: { offset, limit },
      sort,
    });

    // Perform search
    const searchResults = await searchService.search({
      query: q,
      category,
      verified,
      source,
      tags: Array.isArray(tags) ? tags : tags ? [tags] : undefined,
      offset,
      limit,
      sort,
    });

    // Transform results for API response
    const response = {
      results: searchResults.results.map((server: IMcpServerDocument) => ({
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
router.get('/suggestions', validateQuery(suggestionsQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q } = req.query;

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