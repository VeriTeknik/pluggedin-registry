import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ValidationError } from './errorHandler';

type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Creates a validation middleware for the specified schema and target
 */
export function validate(schema: Joi.ObjectSchema, target: ValidationTarget = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const data = req[target];
    
    const { error, value } = schema.validate(data, {
      abortEarly: false, // Return all errors, not just the first one
      stripUnknown: true, // Remove unknown keys
      convert: true, // Perform type conversions
    });

    if (error) {
      // Format validation errors
      const details = error.details.reduce((acc, detail) => {
        const key = detail.path.join('.');
        acc[key] = detail.message;
        return acc;
      }, {} as Record<string, string>);

      return next(new ValidationError('Validation failed', details));
    }

    // Replace request data with validated and sanitized values
    req[target] = value;
    next();
  };
}

/**
 * Validates query parameters
 */
export const validateQuery = (schema: Joi.ObjectSchema) => validate(schema, 'query');

/**
 * Validates request body
 */
export const validateBody = (schema: Joi.ObjectSchema) => validate(schema, 'body');

/**
 * Validates URL parameters
 */
export const validateParams = (schema: Joi.ObjectSchema) => validate(schema, 'params');