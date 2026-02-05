import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { envConfigRouter } from './env.js';

const router: ExpressRouter = Router();

// Mount env config routes
router.use('/env', envConfigRouter);

export { router as configRouter };
