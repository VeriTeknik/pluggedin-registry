import { Router, Request, Response, NextFunction } from 'express';
import { validateBody, validateParams } from '../../../middleware/validation';
import { logger } from '../../../utils/logger';
import { registryService } from '../../../services/registry.service';
import { searchService } from '../../../services/search.service';
import { serverIdSchema } from '../../../validation/schemas';
import Joi from 'joi';

const router = Router();

// Schema for claiming a server
const claimServerSchema = Joi.object({
  proof_url: Joi.string().uri().optional(),
  notes: Joi.string().max(500).optional(),
});

// Schema for unclaiming a server
const unclaimServerSchema = Joi.object({
  reason: Joi.string().max(500).optional(),
});

/**
 * GET /api/v1/internal/claim/unclaimed
 * Get list of unclaimed servers that can be claimed
 */
router.get('/unclaimed', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const source = req.query.source as string;

    // Search for unclaimed servers
    const results = await searchService.search({
      query: '',
      limit,
      offset,
      sort: 'updated',
      filters: {
        source,
        unclaimed: true,
      },
    });

    res.json({
      servers: results.results.map(server => ({
        id: server._id,
        name: server.name,
        description: server.description,
        source: server.source,
        repository: server.repository?.url,
        metadata: {
          verified: server.metadata.verified,
          github_stars: server.metadata.github_stars,
          category: server.metadata.category,
          tags: server.metadata.tags,
        },
        created_at: server.created_at,
      })),
      total: results.total,
      offset: results.offset,
      limit: results.limit,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/internal/claim/my-servers
 * Get servers claimed by the current user
 */
router.get('/my-servers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    // Search for servers claimed by this user
    const results = await searchService.search({
      query: '',
      limit,
      offset,
      sort: 'updated',
      filters: {
        claimed_by: userId,
      },
    });

    res.json({
      servers: results.results.map(server => ({
        id: server._id,
        name: server.name,
        description: server.description,
        source: server.source,
        repository: server.repository?.url,
        metadata: {
          verified: server.metadata.verified,
          github_stars: server.metadata.github_stars,
          category: server.metadata.category,
          tags: server.metadata.tags,
          install_count: server.metadata.install_count,
          rating: server.metadata.rating,
        },
        claimed_at: server.claimed_at,
        created_at: server.created_at,
        updated_at: server.updated_at,
      })),
      total: results.total,
      offset: results.offset,
      limit: results.limit,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/internal/claim/:id
 * Claim an unclaimed server
 */
router.post('/:id', 
  validateParams(serverIdSchema),
  validateBody(claimServerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;
      const userEmail = req.userEmail;
      const { proof_url, notes } = req.body;

      // Get the server
      const server = await registryService.getServerById(id);
      if (!server) {
        res.status(404).json({ error: 'Server not found' });
        return;
      }

      // Check if already claimed
      if (server.claimed_by) {
        res.status(409).json({ 
          error: 'Server already claimed',
          claimed_at: server.claimed_at,
        });
        return;
      }

      // Claim the server
      server.claimed_by = userId;
      server.claimed_at = new Date();
      await server.save();

      // Re-index in Elasticsearch
      await searchService.indexServer(server);

      logger.info('Server claimed successfully', {
        serverId: id,
        serverName: server.name,
        claimedBy: userId,
        userEmail,
        proof_url,
        notes,
      });

      res.json({
        message: 'Server claimed successfully',
        server: {
          id: server._id,
          name: server.name,
          claimed_at: server.claimed_at,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/internal/claim/:id
 * Unclaim a server (release ownership)
 */
router.delete('/:id',
  validateParams(serverIdSchema),
  validateBody(unclaimServerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;
      const { reason } = req.body;

      // Get the server
      const server = await registryService.getServerById(id);
      if (!server) {
        res.status(404).json({ error: 'Server not found' });
        return;
      }

      // Check if claimed by this user
      if (!server.claimed_by) {
        res.status(400).json({ error: 'Server is not claimed' });
        return;
      }

      if (server.claimed_by !== userId) {
        res.status(403).json({ error: 'You can only unclaim servers you own' });
        return;
      }

      // Unclaim the server
      server.claimed_by = undefined;
      server.claimed_at = undefined;
      await server.save();

      // Re-index in Elasticsearch
      await searchService.indexServer(server);

      logger.info('Server unclaimed successfully', {
        serverId: id,
        serverName: server.name,
        unclaimedBy: userId,
        reason,
      });

      res.json({
        message: 'Server unclaimed successfully',
        server: {
          id: server._id,
          name: server.name,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/internal/claim/:id/verify
 * Verify ownership of a claimed server (future enhancement)
 */
router.post('/:id/verify',
  validateParams(serverIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      // Get the server
      const server = await registryService.getServerById(id);
      if (!server) {
        res.status(404).json({ error: 'Server not found' });
        return;
      }

      // Check ownership
      if (server.claimed_by !== userId) {
        res.status(403).json({ error: 'You can only verify servers you own' });
        return;
      }

      // TODO: Implement actual verification logic
      // - Check GitHub repository ownership
      // - Check npm package ownership
      // - Check domain ownership
      // For now, just return a placeholder response

      res.json({
        message: 'Verification process initiated',
        server: {
          id: server._id,
          name: server.name,
        },
        verification: {
          status: 'pending',
          methods: ['github', 'npm', 'domain'],
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;