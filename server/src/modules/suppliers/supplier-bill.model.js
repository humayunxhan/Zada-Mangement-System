import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  pharmacyId: { type: String, required: true, index: true }, branchId: { type: String, required: true, index: true },
  syncId: { type: String, required: true }, postingDate: { type: String, required: true, index: true }, billDate: String,
  supplierName: { type: String, required: true, index: true }, supplierBillNo: String, voucherNo: String,
  totalBillAmount: { type: Number, default: 0 }, taxPercent: { type: Number, default: 0 }, taxAmount: { type: Number, default: 0 },
  actualAmount: { type: Number, default: 0 }, category: { type: String, default: 'PAYABLE' }, remarks: String,
  deletedAt: Date, raw: mongoose.Schema.Types.Mixed, syncSource: String,
}, { timestamps: true });
schema.index({ pharmacyId: 1, branchId: 1, syncId: 1 }, { unique: true });
schema.index({ pharmacyId: 1, branchId: 1, supplierName: 1, supplierBillNo: 1 });
export const SupplierBill = mongoose.model('SupplierBill', schema);
