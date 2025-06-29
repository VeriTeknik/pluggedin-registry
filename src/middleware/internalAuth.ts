import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from './errorHandler';
import { logger } from '../utils/logger';

// Extend Request to include user context
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
      isInternalRequest?: boolean;
    }
  }
}

/**
 * Internal API authentication middleware
 * Validates internal API key and extracts user context from headers
 */
export function internalAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const apiKey = req.headers['x-api-key'] || req.headers['x-internal-api-key'];
    const expectedKey = process.env.INTERNAL_API_KEY;

    // Check if API key is configured
    if (!expectedKey) {
      logger.error('INTERNAL_API_KEY not configured');
      throw new UnauthorizedError('Internal API not configured');
    }

    // Validate API key
    if (!apiKey || apiKey !== expectedKey) {
      logger.warn('Invalid internal API key attempt', {
        ip: req.ip,
        path: req.path,
        hasKey: !!apiKey,
      });
      throw new UnauthorizedError('Invalid API key');
    }

    // Extract user context from headers
    const userId = req.headers['x-user-id'] as string;
    const userEmail = req.headers['x-user-email'] as string;

    if (!userId) {
      throw new UnauthorizedError('User context required');
    }

    // Attach user context to request
    req.userId = userId;
    req.userEmail = userEmail;
    req.isInternalRequest = true;

    logger.debug('Internal API request authenticated', {
      userId,
      path: req.path,
      method: req.method,
    });

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional internal auth - allows public access but adds context if available
 */
export function optionalInternalAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] || req.headers['x-internal-api-key'];
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (apiKey && expectedKey && apiKey === expectedKey) {
    // Valid internal request, add context
    req.userId = req.headers['x-user-id'] as string;
    req.userEmail = req.headers['x-user-email'] as string;
    req.isInternalRequest = true;
  }

  next();
}