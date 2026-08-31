// ============================================================
// Supabase Configuration - Load from Environment Variables
// ============================================================
// ⚠️ SECURITY: Do NOT hardcode credentials here!
//
// For development:
//   1. Copy .env.example to .env.js
//   2. Fill in your credentials
//   3. .env.js is in .gitignore and will NOT be committed
//   4. Load index.html with a simple HTTP server
//
// For production:
//   - Inject SUPABASE_URL and SUPABASE_ANON_KEY via environment variables
//   - Or use a server that renders these values into window.SUPABASE_CONFIG
//
// Example (in your server or build process):
//   <script>
//     window.SUPABASE_CONFIG = {
//       url: process.env.SUPABASE_URL,
//       key: process.env.SUPABASE_ANON_KEY
//     };
//   </script>

let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bm1kZnlwZHR5cXRrcHVraXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxODQ4MTgsImV4cCI6MjEwMzc2MDgxOH0.XQXK8S8A7k8_zR3flR1zks_wTWTct5cL336XWluDSFw';

// Try to load from injected config (production/server-side injection)
if (window.SUPABASE_CONFIG) {
  SUPABASE_URL = window.SUPABASE_CONFIG.url;
  SUPABASE_ANON_KEY = window.SUPABASE_CONFIG.key;
  console.log('✅ Loaded Supabase config from window.SUPABASE_CONFIG');
}

// Validate that credentials are loaded
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    '❌ Supabase credentials not found!\n\n' +
    'For development:\n' +
    '  1. Copy .env.example to .env.js\n' +
    '  2. Fill in your Supabase URL and ANON_KEY\n' +
    '  3. Add this to index.html BEFORE supabase-config.js:\n' +
    '     <script src=".env.js"></script>\n\n' +
    'For production:\n' +
    '  - Ensure SUPABASE_URL and SUPABASE_ANON_KEY are injected via\n' +
    '    window.SUPABASE_CONFIG or environment variables\n\n' +
    'Learn more: https://supabase.com/docs/guides/api/rest/authentication'
  );
}

// Wait for Supabase library to load, then initialize client
let supabaseClient = null;
function initSupabaseClient() {
  if (!window.supabase) {
    console.warn('⏳ Waiting for Supabase library to load...');
    setTimeout(initSupabaseClient, 100);
    return;
  }
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase client initialized');
  }
}

// Initialize immediately if library is ready, otherwise wait
if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  document.addEventListener('DOMContentLoaded', initSupabaseClient);
  // Also try in case DOM is already loaded
  setTimeout(initSupabaseClient, 500);
}
