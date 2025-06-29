import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export function errorHandler(
  error: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  logger.error('API Error:', {
    message: error.message,
    stack: error.stack,
    code: error.code,
    details: error.details,
  });

  // Determine status code
  const statusCode = error.statusCode || 500;

  // Send error response
  res.status(statusCode).json({
    error: {
      message: error.message || 'Internal Server Error',
      code: error.code || 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack,
        details: error.details,
      }),
    },
    timestamp: new Date().toISOString(),
  });
}

export class ValidationError extends Error implements ApiError {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error implements ApiError {
  statusCode = 404;
  code = 'NOT_FOUND';
  
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends Error implements ApiError {
  statusCode = 401;
  code = 'UNAUTHORIZED';
  
  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error implements ApiError {
  statusCode = 403;
  code = 'FORBIDDEN';
  
  constructor(message: string = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends Error implements ApiError {
  statusCode = 409;
  code = 'CONFLICT';
  
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}