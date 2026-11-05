export const config = Object.freeze({
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, ''),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
});

export const authConfigured = Boolean(config.supabaseUrl && config.supabaseKey);
