import { Router, Request, Response, NextFunction } from 'express';
import { strictRateLimiter } from '../../middleware/rateLimiter';
import { UnauthorizedError } from '../../middleware/errorHandler';
import { validateBody, validateParams } from '../../middleware/validation';
import { logger } from '../../utils/logger';
import { 
  publishServerSchema, 
  updateServerSchema, 
  serverIdSchema, 
  addVersionSchema 
} from '../../validation/schemas';
import { registryService } from '../../services/registry.service';

const router = Router();

/**
 * POST /api/v1/registry/publish
 * Publish a new MCP server to the registry
 */
router.post('/publish', strictRateLimiter, validateBody(publishServerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: Implement authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization token');
    }

    // Body has been validated by middleware
    const serverData = req.body;

    // TODO: Extract publisher ID from JWT token
    const publisherId = '507f1f77bcf86cd799439011'; // This will be replaced with actual JWT extraction

    // Publish server using registry service
    const server = await registryService.publishServer(serverData, publisherId);

    res.status(201).json({
      message: 'Server published successfully',
      server: {
        id: server._id,
        name: server.name,
        description: server.description,
        repository: server.repository,
        status: 'pending_verification',
        metadata: server.metadata,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/registry/servers/:id
 * Get a specific server by ID
 */
router.get('/servers/:id', validateParams(serverIdSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Fetch server using registry service
    const server = await registryService.getServerById(id);
    
    if (!server) {
      res.status(404).json({
        error: 'Server not found',
      });
      return;
    }

    res.json({
      server: {
        id: server._id,
        name: server.name,
        description: server.description,
        repository: server.repository,
        capabilities: server.capabilities,
        versions: server.versions,
        command: server.command,
        args: server.args,
        env: server.env,
        url: server.url,
        metadata: server.metadata,
        publisher: server.publisher_id,
        submitted_at: server.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/registry/servers/:id
 * Update a server
 */
router.put('/servers/:id', validateParams(serverIdSchema), validateBody(updateServerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: Implement authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization token');
    }

    const { id } = req.params;
    const updates = req.body;

    // TODO: Extract publisher ID from JWT token
    const publisherId = '507f1f77bcf86cd799439011'; // This will be replaced with actual JWT extraction

    // Update server using registry service
    const server = await registryService.updateServer(id, updates, publisherId);

    res.json({
      message: 'Server updated successfully',
      server: {
        id: server._id,
        name: server.name,
        description: server.description,
        repository: server.repository,
        metadata: server.metadata,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/registry/servers/:id
 * Delete a server
 */
router.delete('/servers/:id', strictRateLimiter, validateParams(serverIdSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: Implement authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization token');
    }

    const { id } = req.params;

    // TODO: Extract publisher ID from JWT token
    const publisherId = '507f1f77bcf86cd799439011'; // This will be replaced with actual JWT extraction

    // Delete server using registry service
    await registryService.deleteServer(id, publisherId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/registry/servers/:id/versions
 * Add a new version to a server
 */
router.post('/servers/:id/versions', strictRateLimiter, validateParams(serverIdSchema), validateBody(addVersionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: Implement authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization token');
    }

    const { id } = req.params;
    const versionData = req.body;

    // TODO: Extract publisher ID from JWT token
    const publisherId = '507f1f77bcf86cd799439011'; // This will be replaced with actual JWT extraction

    // Add version using registry service
    const server = await registryService.addVersion(id, versionData, publisherId);

    res.json({
      message: 'Version added successfully',
      server: {
        id: server._id,
        name: server.name,
        versions: server.versions,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;