// Shared by Vite's build validation and the browser. Never include key values in errors.
export function readPublicAuthConfig(environment = {}, { production = false } = {}) {
  const supabaseUrl = (environment.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const supabaseKey = (environment.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
  const sessionSource = (environment.VITE_AUTH_SESSION_SOURCE || 'supabase').trim();
  const apiBaseUrl = (environment.VITE_API_BASE_URL || 'http://localhost:8000')
    .trim()
    .replace(/\/$/, '');
  if (!['supabase', 'api'].includes(sessionSource)) {
    throw new Error('VITE_AUTH_SESSION_SOURCE must be supabase or api.');
  }
  if (Boolean(supabaseUrl) !== Boolean(supabaseKey)) {
    throw new Error('Configure both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
  }
  if (supabaseUrl) {
    let origin;
    try {
      origin = new URL(supabaseUrl);
    } catch {
      /* Report names only below. */
    }
    if (
      !origin ||
      origin.protocol !== 'https:' ||
      origin.username ||
      origin.password ||
      origin.port ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    ) {
      throw new Error('VITE_SUPABASE_URL must be your Supabase HTTPS project origin.');
    }
    let publicKey = supabaseKey.startsWith('sb_publishable_');
    if (!publicKey && supabaseKey.split('.').length === 3) {
      try {
        const payload = supabaseKey.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
        publicKey = JSON.parse(atob(payload)).role === 'anon';
      } catch {
        /* A key format check is not user authentication. */
      }
    }
    if (!publicKey) {
      throw new Error(
        'Use a Supabase publishable key or legacy anon key. Secret/service-role keys are prohibited in frontend configuration.',
      );
    }
    if (production && sessionSource === 'api' && !apiBaseUrl.startsWith('https://')) {
      throw new Error('API authentication requires an HTTPS VITE_API_BASE_URL in production.');
    }
  }
  return Object.freeze({ supabaseUrl, supabaseKey, sessionSource, apiBaseUrl });
}
