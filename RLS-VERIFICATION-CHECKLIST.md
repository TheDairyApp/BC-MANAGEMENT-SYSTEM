# Supabase RLS (Row-Level Security) Verification Checklist

**Status:** ⚠️ **MUST VERIFY BEFORE PRODUCTION DEPLOYMENT**

This checklist ensures that multi-user data isolation is properly enforced at the database level.

---

## 🔒 RLS Policy Verification

### Step 1: Access Supabase Dashboard
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Log in with your credentials
3. Select project: **bc-management-system** (or your project name)

### Step 2: Check RLS is Enabled on All Tables

For **each table** (`committees`, `members`, `payout_schedule`, `transactions`):

- [ ] Navigate to **SQL Editor** in Supabase Dashboard
- [ ] Run this query for each table:
  ```sql
  -- Check if RLS is enabled
  SELECT tablename, rowsecurity 
  FROM pg_tables 
  WHERE schemaname = 'public' AND tablename IN ('committees', 'members', 'payout_schedule', 'transactions');
  ```
  **Expected result:** `rowsecurity` should be `t` (true) for all tables
  - [ ] `committees` → RLS enabled ✓
  - [ ] `members` → RLS enabled ✓
  - [ ] `payout_schedule` → RLS enabled ✓
  - [ ] `transactions` → RLS enabled ✓

### Step 3: Verify RLS Policies

Go to **Authentication** → **Policies** in Supabase Dashboard

#### For `committees` Table:
- [ ] Policy exists that restricts to `auth.uid()`
- [ ] **Expected policy:**
  ```sql
  CREATE POLICY "Users can view their own committees"
  ON committees FOR SELECT
  USING (auth.uid() = user_id);

  CREATE POLICY "Users can insert their own committees"
  ON committees FOR INSERT
  WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can update their own committees"
  ON committees FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can delete their own committees"
  ON committees FOR DELETE
  USING (auth.uid() = user_id);
  ```

#### For `members` Table:
- [ ] Policy exists that restricts via committee relationship
- [ ] **Expected policy:** Members belong to a committee, and only the committee owner can see/edit

#### For `payout_schedule` Table:
- [ ] Policy exists that restricts via committee relationship
- [ ] **Expected policy:** Schedule belongs to a committee, only owner can access

#### For `transactions` Table:
- [ ] Policy exists that restricts via committee relationship
- [ ] **Expected policy:** Transactions belong to a committee, only owner can access

---

## 🧪 Security Test: Verify Data Isolation

### Test A: User A Cannot See User B's Data

1. **Create two test users:**
   - User A: `testa@example.com` / `password123`
   - User B: `testb@example.com` / `password123`

2. **With User A:**
   - Create a committee "Committee A"
   - Verify it appears in dashboard

3. **With User B:**
   - Open the app in a separate browser/incognito tab
   - Log in with User B account
   - Navigate to Committees view
   - **VERIFY:** Only User B's committees are shown, NOT "Committee A"

4. **Direct API Test (User B cannot access User A's data):**
   - Open browser console (F12)
   - Run this command:
     ```javascript
     const { data, error } = await supabaseClient
       .from('committees')
       .select('*');
     console.log('User B sees:', data); // Should be empty or User B's only
     ```
   - **Expected:** Empty array or only User B's committees
   - **If returns User A's committees:** ❌ RLS FAILED - SECURITY BREACH

---

## ⚠️ Critical Security Issues to Check

### Issue 1: Check for `(public, public)` Policies
- [ ] Go to each table's policies
- [ ] **Do NOT see** any policy that reads `(public, public)` or allows `true` for all rows
- If found: **REMOVE IMMEDIATELY** - this disables RLS

### Issue 2: Verify ANON KEY Permissions
1. Go to **Settings** → **API**
2. Look at "anon" JWT token
3. Verify it has `role: "anon"` (NOT "authenticated" or "service_role")
4. **VERIFY:** Service role key is NOT exposed in client code

### Issue 3: Check Row-Level Security in Auth > Policies
- [ ] Policies use `auth.uid()` to compare user IDs
- [ ] NO policies that check hardcoded user IDs
- [ ] NO public access policies without explicit auth checks

---

## ✅ Quick Verification Command

Run this in Supabase SQL Editor:

```sql
-- View all RLS policies
SELECT 
  tablename,
  policyname,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**Expected output:**
- All tables should have 4 policies (SELECT, INSERT, UPDATE, DELETE)
- All policies should filter by `(auth.uid() = user_id)` or similar
- `qual` and `with_check` should reference `auth.uid()`, not `true` or hardcoded IDs

---

## 🚨 If RLS is NOT Enabled

### CRITICAL FAILURE:
If any of the above checks fail, **DO NOT DEPLOY**. Your database is unsecured.

### Fix:
1. Go to **SQL Editor** in Supabase
2. Run the SQL migration to enable RLS (see `schema.sql` in your repo)
3. Test again using the verification steps above
4. Only deploy after all checks pass ✅

---

## 📋 Final Deployment Sign-Off

- [ ] Verified RLS is enabled on all 4 tables
- [ ] Verified all RLS policies restrict by `auth.uid()` or committee relationship
- [ ] Tested User A cannot see User B's data
- [ ] Tested API directly and confirmed data isolation works
- [ ] No `(public, public)` or blanket `true` policies found
- [ ] Service role key is NOT in client code
- [ ] ANON key is properly scoped

**Approved for production:** ☐ YES ☐ NO

---

## 🔗 Resources
- [Supabase RLS Docs](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [JWT Claims](https://supabase.com/docs/guides/auth/jwts)
