import { Router } from 'express';
import { internalAuth } from '../../../middleware/internalAuth';
import registryRoutes from './registry';
import verifyRoutes from './verify';
import claimRoutes from './claim';

const router = Router();

// Apply internal authentication to all routes
router.use(internalAuth);

// Internal routes - require authentication
router.use('/registry', registryRoutes);
router.use('/verify', verifyRoutes);
router.use('/claim', claimRoutes);

// Add more internal routes here as needed
// router.use('/admin', adminRoutes);

export default router;