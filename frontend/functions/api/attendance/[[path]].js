import publicConfig from '../../../.server-generated/public-config.js';
import { handleAttendance } from '../../../server/attendance.js';
export async function onRequest({ request, env }) {
  return handleAttendance(request, { ...publicConfig, adminKey: env.SUPABASE_ADMIN_KEY });
}
