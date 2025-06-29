import { Router } from 'express';
import v1Routes from './v1';

const router = Router();

// API versioning
router.use('/v1', v1Routes);

// Default API info
router.get('/', (_req, res) => {
  res.json({
    name: 'Plugged.in Registry API',
    version: '1.0.0',
    description: 'MCP Registry Service for advanced search and discovery',
    endpoints: {
      v1: '/api/v1',
    },
  });
});

export default router;