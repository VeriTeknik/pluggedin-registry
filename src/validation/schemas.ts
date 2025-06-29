import Joi from 'joi';
import { McpServerSource } from '../models';

// Common validation patterns
const patterns = {
  mongoId: Joi.string().hex().length(24),
  uuid: Joi.string().uuid(),
  url: Joi.string().uri(),
  semver: Joi.string().pattern(/^\d+\.\d+\.\d+(-[\w.]+)?$/),
  githubRepo: Joi.string().pattern(/^[\w.-]+\/[\w.-]+$/),
  npmPackage: Joi.string().pattern(/^(@[\w-]+\/)?[\w-]+$/),
  domain: Joi.string().domain(),
};

// Search endpoint validation
export const searchQuerySchema = Joi.object({
  q: Joi.string().max(200).allow(''),
  category: Joi.string().valid('tools', 'resources', 'prompts'),
  verified: Joi.boolean(),
  source: Joi.string().valid(...Object.values(McpServerSource)),
  tags: Joi.alternatives().try(
    Joi.string(), // Single tag
    Joi.array().items(Joi.string()) // Array of tags
  ),
  offset: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('relevance', 'stars', 'downloads', 'rating', 'updated').default('relevance'),
});

// Search suggestions validation
export const suggestionsQuerySchema = Joi.object({
  q: Joi.string().min(2).max(50).required(),
});

// Registry publish validation
export const publishServerSchema = Joi.object({
  name: Joi.string()
    .pattern(/^[a-z0-9][a-z0-9-_.]*[a-z0-9]$/)
    .min(3)
    .max(100)
    .required()
    .messages({
      'string.pattern.base': 'Server name must contain only lowercase letters, numbers, hyphens, underscores, and dots',
    }),
  description: Joi.string().min(10).max(1000).required(),
  repository: Joi.object({
    url: patterns.url.required(),
    source: Joi.string().valid('github', 'gitlab', 'bitbucket').required(),
    id: Joi.string().required(),
    default_branch: Joi.string(),
  }).required(),
  capabilities: Joi.object({
    tools: Joi.object().pattern(Joi.string(), Joi.any()),
    resources: Joi.object().pattern(Joi.string(), Joi.any()),
    prompts: Joi.object().pattern(Joi.string(), Joi.any()),
    logging: Joi.object().pattern(Joi.string(), Joi.any()),
  }).required(),
  versions: Joi.array().items(
    Joi.object({
      version: patterns.semver.required(),
      release_date: Joi.date().iso().required(),
      changelog: Joi.string().max(5000),
      packages: Joi.array().items(
        Joi.object({
          registry_name: Joi.string().valid('npm', 'docker', 'pypi').required(),
          name: Joi.string().required(),
          version: patterns.semver.required(),
          package_arguments: Joi.array().items(Joi.string()),
          environment_variables: Joi.object().pattern(Joi.string(), Joi.string()),
        })
      ),
    })
  ).min(1).required(),
  command: Joi.string().max(500),
  args: Joi.array().items(Joi.string()),
  env: Joi.object().pattern(Joi.string(), Joi.string()),
  url: patterns.url,
  tags: Joi.array().items(Joi.string().max(50)).max(10),
  category: Joi.string().valid('tools', 'resources', 'prompts', 'other'),
});

// Update server validation (partial update)
export const updateServerSchema = Joi.object({
  description: Joi.string().min(10).max(1000),
  repository: Joi.object({
    url: patterns.url,
    source: Joi.string().valid('github', 'gitlab', 'bitbucket'),
    id: Joi.string(),
    default_branch: Joi.string(),
  }),
  capabilities: Joi.object({
    tools: Joi.object().pattern(Joi.string(), Joi.any()),
    resources: Joi.object().pattern(Joi.string(), Joi.any()),
    prompts: Joi.object().pattern(Joi.string(), Joi.any()),
    logging: Joi.object().pattern(Joi.string(), Joi.any()),
  }),
  command: Joi.string().max(500).allow(null),
  args: Joi.array().items(Joi.string()),
  env: Joi.object().pattern(Joi.string(), Joi.string()),
  url: patterns.url.allow(null),
  tags: Joi.array().items(Joi.string().max(50)).max(10),
  category: Joi.string().valid('tools', 'resources', 'prompts', 'other'),
}).min(1); // At least one field must be present

// Add version validation
export const addVersionSchema = Joi.object({
  version: patterns.semver.required(),
  release_date: Joi.date().iso().default(() => new Date()),
  changelog: Joi.string().max(5000),
  packages: Joi.array().items(
    Joi.object({
      registry_name: Joi.string().valid('npm', 'docker', 'pypi').required(),
      name: Joi.string().required(),
      version: patterns.semver.required(),
      package_arguments: Joi.array().items(Joi.string()),
      environment_variables: Joi.object().pattern(Joi.string(), Joi.string()),
    })
  ),
});

// Server ID validation
export const serverIdSchema = Joi.object({
  id: patterns.mongoId.required(),
});

// Domain verification validation
export const domainVerificationSchema = Joi.object({
  domain: patterns.domain.required(),
});

// GitHub verification validation
export const githubVerificationSchema = Joi.object({
  organization: Joi.string()
    .pattern(/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid GitHub organization name format',
    }),
  repository: Joi.string()
    .pattern(/^[a-zA-Z0-9._-]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid GitHub repository name format',
    }),
});

// Publisher registration validation
export const publisherRegistrationSchema = Joi.object({
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(30)
    .required(),
  email: Joi.string()
    .email()
    .required(),
  password: Joi.string()
    .min(8)
    .max(128)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
    }),
});

// Publisher login validation
export const publisherLoginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});