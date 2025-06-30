import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { connectMongoDB } from './services/mongodb';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mode: 'test',
  });
});

// Simple authentication middleware for internal API
const internalAuth = (req: any, res: any, next: any): void => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.INTERNAL_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};

// Import endpoint that returns a realistic mock response
app.post('/api/v1/internal/import/repository', internalAuth, async (req, res): Promise<void> => {
  try {
    const { repository_url } = req.body;
    logger.info('Import request received:', { repository_url });
    
    if (!repository_url) {
      res.status(400).json({ error: 'repository_url is required' });
      return;
    }

    // Validate GitHub URL
    const githubUrlPattern = /^https:\/\/github\.com\/[\w-]+\/[\w.-]+\/?$/;
    if (!githubUrlPattern.test(repository_url)) {
      res.status(400).json({ error: 'Invalid GitHub repository URL' });
      return;
    }

    // Extract repo info
    const urlParts = repository_url.replace('https://github.com/', '').replace(/\/$/, '').split('/');
    const repoName = urlParts[1];
    
    // Simulate AI extraction with realistic data
    const mockExtractionResult = {
      extracted_config: {
        name: repoName,
        description: `MCP server for ${repoName}`,
        command: 'npx',
        args: ['-y', `@modelcontextprotocol/server-${repoName}`],
        env: {
          API_KEY: {
            description: 'API key for the service',
            required: true,
            example: 'your-api-key-here'
          },
          DEBUG: {
            description: 'Enable debug logging',
            required: false,
            example: 'true'
          }
        },
        capabilities: {
          tools: true,
          resources: false,
          prompts: false,
          logging: true
        },
        transport: 'stdio'
      },
      confidence_scores: {
        overall: 0.85,
        completeness: 0.9
      },
      warnings: ['This is a mock response for testing the UI']
    };

    // Mock server object
    const mockServer = {
      _id: '507f1f77bcf86cd799439011',
      name: repoName,
      description: `MCP server for ${repoName}`,
      repository: {
        url: repository_url,
        source: 'github',
        id: `${urlParts[0]}/${urlParts[1]}`
      },
      ai_extraction: {
        raw_config: mockExtractionResult.extracted_config,
        confidence_score: mockExtractionResult.confidence_scores.overall,
        extracted_at: new Date()
      },
      created_at: new Date(),
      updated_at: new Date()
    };
    
    res.status(201).json({
      message: 'Repository imported successfully',
      server: mockServer,
      is_new: true,
      extraction: {
        confidence: mockExtractionResult.confidence_scores,
        warnings: mockExtractionResult.warnings
      }
    });

  } catch (error) {
    logger.error('Import failed:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
  });
});

// Start server
async function startServer() {
  try {
    // Try to connect to MongoDB if available
    try {
      await connectMongoDB();
      logger.info('MongoDB connected');
    } catch (error) {
      logger.warn('MongoDB connection failed, continuing without it', { error });
    }

    // Start HTTP server
    httpServer.listen(Number(PORT), () => {
      logger.info(`Test registry server running on port ${PORT}`);
      logger.info(`Health check available at http://localhost:${PORT}/health`);
      logger.info(`Import endpoint at http://localhost:${PORT}/api/v1/internal/import/repository`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();