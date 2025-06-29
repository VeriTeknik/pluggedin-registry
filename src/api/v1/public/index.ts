import { Router } from 'express';
import searchRoutes from './search';
import discoverRoutes from './discover';
import serversRoutes from './servers';

const router = Router();

// Public routes - no authentication required
router.use('/search', searchRoutes);
router.use('/discover', discoverRoutes);
router.use('/servers', serversRoutes);

export default router;