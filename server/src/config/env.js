import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT || 4100),
  mongoUri: process.env.MONGODB_URI?.trim() || null,
  clientOrigins: process.env.CLIENT_ORIGINS || '*',
  authEnabled: process.env.AUTH_ENABLED === 'true',
  defaultPharmacyId: process.env.DEFAULT_PHARMACY_ID || 'zada-pharmacy',
  defaultBranchId: process.env.DEFAULT_BRANCH_ID || 'main',
};
