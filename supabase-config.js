// ============================================================
// Supabase Configuration (Project: ltnmdfypdtyqtkpukipl)
// ============================================================

const SUPABASE_URL = 'https://ltnmdfypdtyqtkpukipl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bm1kZnlwZHR5cXRrcHVraXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxODQ4MTgsImV4cCI6MjEwMzc2MDgxOH0.XQXK8S8A7k8_zR3flR1zks_wTWTct5cL336XWluDSFw';

// Initialize Supabase client (global, used by db.js)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
