import { readPublicAuthConfig } from '../../scripts/public-auth-config.mjs';

export const config = readPublicAuthConfig(
  {
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_AUTH_SESSION_SOURCE: import.meta.env.VITE_AUTH_SESSION_SOURCE,
  },
  { production: import.meta.env.PROD },
);

export const authConfigured = Boolean(config.supabaseUrl && config.supabaseKey);
