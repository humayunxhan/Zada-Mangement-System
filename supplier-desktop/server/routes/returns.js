import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { recordEvent } from '../ledger-store.js';
import { flushSupplierSync, supplierSyncStatus } from '../supplier-sync.js';
const router = Router();
router.use(authenticateToken);
router.post('/', async (req, res) => {
  try { res.status(201).json(await recordEvent(req.body, req.user?.username || 'system')); void flushSupplierSync(); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
router.get('/sync-status', async (req, res) => { try { res.json(await supplierSyncStatus()); } catch (e) { res.status(500).json({ error: e.message }); } });
export default router;
