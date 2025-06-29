import { Router } from 'express';
import publicRoutes from './public';
import internalRoutes from './internal';

const router = Router();

// Mount public routes (no auth required)
router.use('/', publicRoutes);

// Mount internal routes (auth required)
router.use('/internal', internalRoutes);

// V1 API info
router.get('/', (_req, res) => {
  res.json({
    version: 'v1',
    public: {
      search: '/api/v1/search',
      discover: {
        featured: '/api/v1/discover/featured',
        trending: '/api/v1/discover/trending',
        recent: '/api/v1/discover/recent',
        categories: '/api/v1/discover/categories',
        stats: '/api/v1/discover/stats',
      },
      servers: '/api/v1/servers/:id',
    },
    internal: {
      registry: '/api/v1/internal/registry',
      verify: '/api/v1/internal/verify',
      claim: {
        unclaimed: '/api/v1/internal/claim/unclaimed',
        myServers: '/api/v1/internal/claim/my-servers',
        claim: '/api/v1/internal/claim/:id',
        unclaim: 'DELETE /api/v1/internal/claim/:id',
        verify: '/api/v1/internal/claim/:id/verify',
      },
    },
  });
});

export default router;