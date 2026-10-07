import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  pharmacyId: { type: String, required: true }, branchId: { type: String, required: true },
  syncId: { type: String, required: true }, kind: { type: String, enum: ['RETURN', 'REFUND', 'ADJUSTMENT'], required: true },
  billSyncId: { type: String, required: true }, targetBillSyncId: { type: String, default: '' },
  eventDate: { type: String, required: true }, amount: { type: Number, required: true },
  paymentMode: String, referenceNo: String, remarks: String, createdBy: String,
}, { timestamps: true });
schema.index({ pharmacyId: 1, branchId: 1, syncId: 1 }, { unique: true });
schema.index({ pharmacyId: 1, branchId: 1, eventDate: 1 });
export const SupplierLedger = mongoose.model('SupplierLedger', schema);
const syncSchema = new mongoose.Schema({ key: { type: String, unique: true }, revision: { type: Number, default: 0 }, versions: { type: mongoose.Schema.Types.Mixed, default: {} } });
export const SupplierSyncState = mongoose.model('SupplierSyncState', syncSchema);
