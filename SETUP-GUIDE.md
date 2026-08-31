# BC Management System - Setup & Running Guide

## ✅ Quick Start (Development)

### Prerequisites
- Python 3.x installed (for HTTP server)
- `.env.js` file exists (should be in root directory)

### Run the App

**Option 1: Python HTTP Server (Recommended)**
```bash
# From the project root directory
cd /path/to/BC-MANAGEMENT-SYSTEM
python3 -m http.server 8000
```

Then open: **http://localhost:8000**

**Option 2: Node.js HTTP Server**
```bash
npx http-server
# Opens on http://localhost:8080
```

**Option 3: Any Static Web Server**
```bash
# Using ruby
ruby -run -ehttpd . -p8000

# Using PHP
php -S localhost:8000

# Using Go
caddy file-server --listen :8000
```

---

## 🔑 Environment Setup

### Development (Local)

1. **Verify `.env.js` exists:**
   ```bash
   ls -la .env.js
   ```
   
   Should show: `-rw-r--r-- 1 root root 606 ...`

2. **Verify `.env.js` contains credentials:**
   ```bash
   cat .env.js
   ```
   
   Should show:
   ```javascript
   window.SUPABASE_CONFIG = {
     url: 'https://ltnmdfypdtyqtkpukipl.supabase.co',
     key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
   };
   ```

3. **Start the server and test:**
   ```bash
   python3 -m http.server 8000 &
   curl http://localhost:8000/.env.js
   # Should return the SUPABASE_CONFIG setup
   ```

### Production (Server Injection)

For production, inject credentials via server before HTML:

```javascript
// In your server (Express example)
app.get('/', (req, res) => {
  const html = `
    <script>
      window.SUPABASE_CONFIG = {
        url: '${process.env.SUPABASE_URL}',
        key: '${process.env.SUPABASE_ANON_KEY}'
      };
    </script>
  `;
  res.send(html + fs.readFileSync('index.html'));
});
```

Environment variables to set:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

---

## 🧪 Testing

### 1. Check Browser Console
Open DevTools (F12) → Console tab

**Expected output:**
```
✅ Loaded Supabase config from window.SUPABASE_CONFIG
✅ Supabase client initialized
```

**If you see errors:**
- "Cannot load resource .env.js" → Server not running from project root
- "supabaseClient is not defined" → .env.js not loading
- "Cannot use import.meta outside a module" → Already fixed, clear cache

### 2. Clear Browser Cache
If you see old errors after fixing:
1. Press `Ctrl+Shift+Delete` (Cmd+Shift+Delete on Mac)
2. Clear "Cached images and files"
3. Refresh page

### 3. Test Login
1. Open http://localhost:8000
2. Enter test email/password
3. Click "Login"
4. Should authenticate with Supabase

---

## 🔧 Troubleshooting

### "Failed to load resource: 404 (.env.js)"

**Cause:** Server not running from correct directory

**Fix:**
```bash
# Make sure you're in the project root
cd /path/to/BC-MANAGEMENT-SYSTEM

# Verify you can see the files
ls -la index.html .env.js supabase-config.js

# Start server
python3 -m http.server 8000
```

### "Cannot use 'import.meta' outside a module"

**Cause:** This has been fixed in the latest commit

**Fix:**
1. Pull latest code: `git pull origin claude/bc-management-audit-qb7rk4`
2. Clear browser cache
3. Refresh page

### "supabaseClient is not defined"

**Cause:** .env.js not loading or credentials not set

**Fix:**
1. Check browser Network tab (F12 → Network)
2. Look for `.env.js` — should show 200 status
3. Check Console for errors
4. Verify `.env.js` has `window.SUPABASE_CONFIG` set

### "ReferenceError: supabaseClient is not defined at db.js:90"

**Cause:** supabase-config.js hasn't finished initializing

**Fix:**
1. This should auto-resolve when .env.js loads
2. If persists, check .env.js is accessible (see above)
3. Try hard refresh: `Ctrl+Shift+R`

---

## 📊 File Checklist

Before running, verify these files exist:

```
BC-MANAGEMENT-SYSTEM/
├── index.html              ✅ Main HTML
├── style.css              ✅ Styles
├── app.js                 ✅ Application logic
├── db.js                  ✅ Database layer
├── supabase-config.js     ✅ Supabase init
├── .env.js                ✅ Development credentials (NOT in git)
├── .env.example           ✅ Credential template
├── .gitignore             ✅ Protects .env.js
└── RLS-VERIFICATION-CHECKLIST.md  ✅ Security guide
```

---

## 🚀 Deployment

### For Vercel / Netlify

1. Set environment variables in dashboard:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-key
   ```

2. Push to main branch:
   ```bash
   git push origin main
   ```

3. Platform auto-deploys and injects credentials

### For Self-Hosted Server

See "Production (Server Injection)" section above

---

## 🔗 Resources

- **Troubleshooting:** Check browser Console (F12)
- **Security:** Review `RLS-VERIFICATION-CHECKLIST.md`
- **Code Changes:** See git log and PR #2
- **Audit Report:** View `AUDIT-REPORT.html` in artifact

---

## ✅ Success Checklist

After setup, you should see:

- [x] HTTP server running on localhost:8000
- [x] Browser loads without 404 errors
- [x] Console shows "✅ Loaded Supabase config"
- [x] Console shows "✅ Supabase client initialized"
- [x] Login screen displays
- [x] Can click Login/Sign Up buttons (no console errors)

---

**Questions?** Check the error messages in browser console (F12) — they provide specific guidance for fixing issues.
