import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// Default rate limiter
export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // 100 requests per window
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use X-Forwarded-For if behind a proxy
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: {
        message: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
      },
    });
  },
});

// Strict rate limiter for sensitive endpoints
export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many requests for this operation, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Search-specific rate limiter
export const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 searches per minute
  message: 'Too many search requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});