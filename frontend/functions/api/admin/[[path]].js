import publicConfig from '../../../.server-generated/public-config.js';
import { handleStaffAccounts } from '../../../server/staffAccounts.js';

export async function onRequest({ request, env }) {
  return handleStaffAccounts(request, { ...publicConfig, adminKey: env.SUPABASE_ADMIN_KEY });
}
