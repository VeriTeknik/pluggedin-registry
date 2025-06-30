import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { connectMongoDB } from './services/mongodb';
import { connectElasticsearch } from './services/elasticsearch';
import { connectRedis } from './services/redis';
import { initializeGitHubService } from './services/github.service';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import routes from './api/routes';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use(rateLimiter);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// API routes
app.use('/api', routes);

// Error handling middleware (must be last)
app.use(errorHandler);

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
    // Connect to databases
    await connectMongoDB();
    logger.info('MongoDB connected');

    await connectElasticsearch();
    logger.info('Elasticsearch connected');

    await connectRedis();
    logger.info('Redis connected');

    // Initialize GitHub service
    try {
      const privateKey = process.env.GITHUB_APP_PRIVATE_KEY
        ? Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY, 'base64').toString()
        : '';

      initializeGitHubService({
        appId: process.env.GITHUB_APP_ID || '',
        privateKey,
        clientId: process.env.GITHUB_CLIENT_ID || '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
        webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
      });
      logger.info('GitHub service initialized');
    } catch (error) {
      logger.warn('GitHub service initialization failed, continuing without it', { error });
    }

    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
      logger.info(`Health check available at http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });
  // Close database connections
  process.exit(0);
});


// Start the server
startServer();