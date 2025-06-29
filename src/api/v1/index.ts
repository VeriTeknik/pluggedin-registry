import { Router } from 'express';
import searchRoutes from './search';
import registryRoutes from './registry';
import verifyRoutes from './verify';

const router = Router();

// Mount route handlers
router.use('/search', searchRoutes);
router.use('/registry', registryRoutes);
router.use('/verify', verifyRoutes);

// V1 API info
router.get('/', (_req, res) => {
  res.json({
    version: 'v1',
    endpoints: {
      search: '/api/v1/search',
      registry: '/api/v1/registry',
      verify: '/api/v1/verify',
    },
  });
});

export default router;