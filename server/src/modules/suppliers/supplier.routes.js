import { Router } from 'express';
import crypto from 'crypto';
import { env } from '../../config/env.js';
import { emitToScope } from '../../core/events/socket.js';
import { SupplierBill } from './supplier-bill.model.js';
import { SupplierPayment } from './supplier-payment.model.js';
import { billAmounts, queryReport, summarize, activityReport } from './supplier.service.js';

import { SupplierLedger } from './supplier-ledger.model.js';
import { applySnapshot, locked } from './supplier-snapshot.service.js';
import ledger from './ledger.cjs';

const moneyTotal = events => ledger.money(events.reduce((n,e)=>n+e.amount,0));
const router = Router();
const scope = (req) => ({ pharmacyId: String(req.query.pharmacyId || req.body?.pharmacyId || env.defaultPharmacyId), branchId: String(req.query.branchId || req.body?.branchId || env.defaultBranchId) });
const emit = (name, sc, entity) => emitToScope(name, { ...sc, entity, at: new Date().toISOString() });

router.get('/bills', async (req, res, next) => { try { const items = await queryReport(scope(req), req.query); const activity = await activityReport(scope(req), req.query); const allSummary = summarize(await queryReport(scope(req))); res.json({ data: { items, summary: { ...summarize(items), ...activity, supplierCreditAllBills: allSummary.pendingCredit }, activity: activity.events } }); } catch (e) { next(e); } });
async function state(sc, session) {
  const bills = await SupplierBill.find({...sc,deletedAt:null}).session(session).lean();
  const payments = await SupplierPayment.find({...sc,deletedAt:null}).session(session).lean();
  const events = await SupplierLedger.find(sc).session(session).lean();
  return {bills,payments,events};
}
const sameBill = (a,b) => ['postingDate','billDate','supplierName','supplierBillNo','voucherNo','totalBillAmount','taxPercent','taxAmount','actualAmount','category','remarks'].every(k=>String(a[k]??'')===String(b[k]??''));
router.post('/snapshot', async(req,res,next)=>{try{const sc=scope(req);const result=await applySnapshot(sc,req.body);if(!result.duplicate)emit('v1.supplier-ledger.updated',sc,result);res.json({data:result});}catch(e){next(e);}});
router.post('/bills', async(req,res,next)=>{try{
  const sc=scope(req), syncId=String(req.body.syncId||crypto.randomUUID());
  const data={...req.body,...billAmounts(req.body),...sc,syncId,deletedAt:null};
  ledger.date(data.postingDate);ledger.date(data.billDate);
  if(!String(data.supplierName||'').trim()||!Number.isFinite(data.totalBillAmount)||!Number.isFinite(data.taxPercent)||data.totalBillAmount<=0||data.taxPercent<0||data.taxPercent>100) return res.status(400).json({message:'Invalid supplier bill.'});
  const item=await locked(sc,async session=>{
    const s=await state(sc,session), old=s.bills.find(b=>b.syncId===syncId);
    if(old&&sameBill(old,data))return old;
    ledger.assertMutable(syncId,s.events);
    if(data.supplierBillNo&&s.bills.some(b=>b.supplierName===data.supplierName&&b.supplierBillNo===data.supplierBillNo&&b.syncId!==syncId)){const e=new Error('Supplier bill number already exists for this supplier');e.status=409;throw e;}
    return SupplierBill.findOneAndUpdate({...sc,syncId},data,{upsert:true,new:true,session}).lean();
  });emit('v1.supplier-bill.updated',sc,item);res.status(201).json({data:item});
}catch(e){next(e);}});
router.patch('/bills/:syncId',async(req,res,next)=>{try{
 const sc=scope(req); const item=await locked(sc,async session=>{
  const s=await state(sc,session),current=s.bills.find(b=>b.syncId===req.params.syncId);
  if(!current){const e=new Error('Bill not found');e.status=404;throw e;}
  ledger.assertMutable(current.syncId,s.events);
  const merged={...current,...req.body,...sc,syncId:current.syncId};const data={...merged,...billAmounts(merged)};
  ledger.date(data.postingDate);ledger.date(data.billDate);
  if(!String(data.supplierName||'').trim()||!Number.isFinite(data.totalBillAmount)||!Number.isFinite(data.taxPercent)||data.totalBillAmount<=0||data.taxPercent<0||data.taxPercent>100){const e=new Error('Invalid supplier bill.');e.status=400;throw e;}
  return SupplierBill.findOneAndUpdate({...sc,syncId:current.syncId},data,{new:true,session}).lean();
 });emit('v1.supplier-bill.updated',sc,item);res.json({data:item});
}catch(e){next(e);}});
router.delete('/bills/:syncId',async(req,res,next)=>{try{
 const sc=scope(req); const item=await locked(sc,async session=>{const s=await state(sc,session);ledger.assertMutable(req.params.syncId,s.events);
 if(s.payments.some(p=>p.billSyncId===req.params.syncId)){const e=new Error('Delete payments before deleting this bill, or record a stock return.');e.status=400;throw e;}
 return SupplierBill.findOneAndUpdate({...sc,syncId:req.params.syncId},{deletedAt:new Date()},{new:true,session}).lean();});emit('v1.supplier-bill.deleted',sc,item);res.json({data:item});
}catch(e){next(e);}});
router.get('/payments',async(req,res,next)=>{try{res.json({data:await SupplierPayment.find({...scope(req),deletedAt:null}).sort({paymentDate:-1}).lean()});}catch(e){next(e);}});
router.post('/payments',async(req,res,next)=>{try{
 const sc=scope(req),syncId=String(req.body.syncId||crypto.randomUUID()); const data={...req.body,...sc,syncId,amount:ledger.positive(req.body.amount),deletedAt:null};
 const item=await locked(sc,async session=>{const s=await state(sc,session);const old=s.payments.find(p=>p.syncId===syncId);
 if(old&&['billSyncId','paymentDate','amount','paymentMode','referenceNo','remarks'].every(k=>String(old[k]??'')===String(data[k]??'')))return old;
 ledger.validatePayment(data,s.bills,s.payments,s.events);return SupplierPayment.findOneAndUpdate({...sc,syncId},data,{upsert:true,new:true,session}).lean();});emit('v1.supplier-payment.updated',sc,item);res.status(201).json({data:item});
}catch(e){next(e);}});
router.delete('/payments/:syncId',async(req,res,next)=>{try{
 const sc=scope(req);const item=await locked(sc,async session=>{const s=await state(sc,session),old=s.payments.find(p=>p.syncId===req.params.syncId);if(old)ledger.assertMutable(old.billSyncId,s.events);return SupplierPayment.findOneAndUpdate({...sc,syncId:req.params.syncId},{deletedAt:new Date()},{new:true,session}).lean();});emit('v1.supplier-payment.deleted',sc,item);res.json({data:item});
}catch(e){next(e);}});
router.post('/returns',async(req,res,next)=>{try{
 const sc=scope(req);const item=await locked(sc,async session=>{const s=await state(sc,session);const e=ledger.validateEvent({...req.body,syncId:req.body.syncId||crypto.randomUUID()},s.bills,s.payments,s.events);return SupplierLedger.findOneAndUpdate({...sc,syncId:e.syncId},{$setOnInsert:{...e,...sc,createdBy:req.body.createdBy||'api'}},{upsert:true,new:true,session}).lean();});emit('v1.supplier-ledger.updated',sc,item);res.status(201).json({data:item});
}catch(e){next(e);}});
router.get('/returns',async(req,res,next)=>{try{res.json({data:await activityReport(scope(req),req.query)});}catch(e){next(e);}});
router.get('/summary', async (req, res, next) => { try { const items = await queryReport(scope(req), req.query); res.json({ data: { ...summarize(items), ...await activityReport(scope(req), req.query) } }); } catch (e) { next(e); } });
router.get('/daily', async (req, res, next) => { try { const sc = scope(req); const items = await queryReport(sc, req.query); const groups = items.reduce((m, b) => { const date = req.query.dateType === 'bill' ? b.billDate : b.postingDate; (m[date] ||= { date, items: [], payments: [] }).items.push(b); return m; }, {}); const paymentFilter = { ...sc, deletedAt: null, paymentDate: { ...(req.query.from ? { $gte: req.query.from } : {}), ...(req.query.to ? { $lte: req.query.to } : {}) } }; if (!req.query.from && !req.query.to) delete paymentFilter.paymentDate; const payments = await SupplierPayment.find(paymentFilter).lean(); payments.forEach((p) => (groups[p.paymentDate] ||= { date: p.paymentDate, items: [], payments: [] }).payments.push(p)); const activity = await activityReport(sc, req.query); activity.events.forEach(e => (groups[e.eventDate] ||= { date: e.eventDate, items: [], payments: [] }).events = [...(groups[e.eventDate].events || []), e]); const data = Object.values(groups).map((g) => ({ ...g, summary: { ...summarize(g.items), returnedOnDate: moneyTotal((g.events || []).filter(e => e.kind === 'RETURN')), refundedOnDate: moneyTotal((g.events || []).filter(e => e.kind === 'REFUND')), adjustedOnDate: moneyTotal((g.events || []).filter(e => e.kind === 'ADJUSTMENT')), paymentsMade: g.payments.reduce((n, p) => n + Number(p.amount || 0), 0) } })); res.json({ data: data.sort((a, b) => b.date.localeCompare(a.date)) }); } catch (e) { next(e); } });
router.get('/names', async (req, res, next) => { try { res.json({ data: await SupplierBill.distinct('supplierName', { ...scope(req), deletedAt: null }) }); } catch (e) { next(e); } });
export default router;
