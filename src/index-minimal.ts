import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';

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
    mode: 'minimal',
  });
});

// Minimal import endpoint for testing
app.post('/api/v1/internal/import/repository', async (req, res) => {
  console.log('Import request received:', req.body);
  
  // Return a mock response for testing
  res.json({
    message: 'Repository imported successfully',
    server: {
      _id: '507f1f77bcf86cd799439011',
      name: 'test-server',
      ai_extraction: {
        raw_config: {
          name: 'test-server',
          description: 'Test server',
          command: 'npx',
          args: ['test-server'],
          capabilities: {
            tools: true,
            resources: false,
            prompts: false,
            logging: false
          }
        }
      }
    },
    is_new: true,
    extraction: {
      confidence: {
        overall: 0.85,
        completeness: 0.9
      },
      warnings: ['This is a mock response for testing']
    }
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`Minimal registry server running on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
  console.log(`Import endpoint at http://localhost:${PORT}/api/v1/internal/import/repository`);
});