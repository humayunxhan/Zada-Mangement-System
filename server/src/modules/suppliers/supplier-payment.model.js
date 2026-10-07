import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  pharmacyId: { type: String, required: true, index: true }, branchId: { type: String, required: true, index: true },
  syncId: { type: String, required: true }, billSyncId: { type: String, required: true, index: true }, paymentDate: { type: String, required: true, index: true },
  amount: { type: Number, required: true }, paymentMode: String, referenceNo: String, remarks: String, deletedAt: Date, syncSource: String,
}, { timestamps: true });
schema.index({ pharmacyId: 1, branchId: 1, syncId: 1 }, { unique: true });
export const SupplierPayment = mongoose.model('SupplierPayment', schema);
