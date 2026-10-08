import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { recordEvent } from '../ledger-store.js';
const router = Router();
router.use(authenticateToken);
router.post('/', async (req, res) => {
  try { res.status(201).json(await recordEvent(req.body, req.user?.username || 'system')); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
router.get('/sync-status', (req, res) => res.json({ enabled: false, pending: 0, error: null }));
export default router;
