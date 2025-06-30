import { Router } from 'express';
import { internalAuth } from '../../../middleware/internalAuth';
import registryRoutes from './registry';
import verifyRoutes from './verify';
import claimRoutes from './claim';
import importRoutes from './import';
import githubRoutes from '../../routes/internal/github';

const router = Router();

// Apply internal authentication to all routes
router.use(internalAuth);

// Internal routes - require authentication
router.use('/registry', registryRoutes);
router.use('/verify', verifyRoutes);
router.use('/claim', claimRoutes);
router.use('/import', importRoutes);
router.use('/github', githubRoutes);

// Add more internal routes here as needed
// router.use('/admin', adminRoutes);

export default router;