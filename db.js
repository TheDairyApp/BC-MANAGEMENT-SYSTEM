// Supabase client initialized in supabase-config.js (loaded before this script)

// ============================================================
// Date / formatting / calc helpers (global, plain <script>)
// ============================================================
function pad2(n) { return String(n).padStart(2, '0'); }
function addMonths(monthKey, n) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function monthKeyFromDate(dateStr) { return dateStr.substring(0, 7); }
function todayMonthKey() { return monthKeyFromDate(new Date().toISOString().split('T')[0]); }
function todayDateStr() { return new Date().toISOString().split('T')[0]; }
function monthLabel(monthKey) {
  if (!monthKey) return '—';
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
function fmtMoney(n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? '-' : '';
  return sign + 'Rs ' + Math.abs(v).toLocaleString('en-PK');
}
function buildScheduleKeys(startDate, totalMonths) {
  const startMonth = startDate.substring(0, 7);
  const arr = [];
  for (let i = 0; i < totalMonths; i++) arr.push(addMonths(startMonth, i));
  return arr;
}
function computeMemberCount(committeeId) {
  return DB.cache.members.filter(m => m.committee_id === committeeId).length;
}
function computePool(committee) {
  const memberCount = computeMemberCount(committee.id) || committee.total_months;
  return committee.pool_override != null ? Number(committee.pool_override) : Number(committee.monthly_installment) * memberCount;
}

// Cell-level status for the Collection Matrix
function computeCellStatus(committee, memberId, monthKey) {
  const txs = DB.cache.transactions.filter(t => t.member_id === memberId && t.month_key === monthKey && t.type === 'inflow_installment');
  const skipped = txs.some(t => (t.notes || '').toUpperCase().includes('SKIPPED'));
  const paidSum = txs.reduce((s, t) => s + Number(t.amount), 0);
  const due = Number(committee.monthly_installment);
  if (skipped) return { status: 'skipped', paidSum, due, txs };
  if (paidSum <= 0) return { status: 'unpaid', paidSum, due, txs };
  if (paidSum < due) return { status: 'partial', paidSum, due, txs };
  return { status: 'full', paidSum, due, txs };
}

// Full per-member ledger across the committee's schedule
function computeMemberLedger(committee, member) {
  const schedule = buildScheduleKeys(committee.start_date, committee.total_months);
  const payoutRow = DB.cache.schedule.find(s => s.member_id === member.id && s.committee_id === committee.id);
  let cumulativePaid = 0;
  const rows = schedule.map(monthKey => {
    const cell = computeCellStatus(committee, member.id, monthKey);
    cumulativePaid += cell.paidSum;
    const payoutSettled = payoutRow && payoutRow.status === 'paid' && payoutRow.month_key <= monthKey;
    const balance = cumulativePaid - (payoutSettled ? Number(payoutRow.payout_amount || 0) : 0);
    return { monthKey, due: cell.due, paid: cell.paidSum, status: cell.status, cumulativePaid, balance, isPayoutMonth: payoutRow && payoutRow.month_key === monthKey };
  });
  return { rows, payoutRow, totalDue: schedule.length * Number(committee.monthly_installment), totalPaid: cumulativePaid };
}

// ============================================================
// DB — cache + Supabase sync
// ============================================================
const DB = {
  cache: {
    committees: [],
    members: [],
    schedule: [],
    transactions: []
  },
  user: null,

  _persist() {
    localStorage.setItem('bcms_committees', JSON.stringify(this.cache.committees));
    localStorage.setItem('bcms_members', JSON.stringify(this.cache.members));
    localStorage.setItem('bcms_schedule', JSON.stringify(this.cache.schedule));
    localStorage.setItem('bcms_transactions', JSON.stringify(this.cache.transactions));
  },

  async init() {
    // Clear any stale cache from old schema (bc_shares, bcs, installment_meta)
    ['bc_cache_bcs','bc_cache_shares','bc_cache_meta','bc_cache_tx',
     'bcms_bcs','bcms_bc_shares','bcms_installment_meta'].forEach(k => localStorage.removeItem(k));

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return false;
    this.user = session.user;
    await this.syncFromServer();
    return true;
  },

  async syncFromServer() {
    const [cRes, mRes, sRes, tRes] = await Promise.all([
      supabaseClient.from('committees').select('*').order('created_at', { ascending: false }),
      supabaseClient.from('members').select('*').order('created_at', { ascending: true }),
      supabaseClient.from('payout_schedule').select('*').order('month_index', { ascending: true }),
      supabaseClient.from('transactions').select('*').order('transaction_date', { ascending: true })
    ]);
    if (cRes.error) console.error(cRes.error);
    if (mRes.error) console.error(mRes.error);
    if (sRes.error) console.error(sRes.error);
    if (tRes.error) console.error(tRes.error);
    if (cRes.data) this.cache.committees = cRes.data;
    if (mRes.data) this.cache.members = mRes.data;
    if (sRes.data) this.cache.schedule = sRes.data;
    if (tRes.data) this.cache.transactions = tRes.data;
    this._persist();
    window.dispatchEvent(new Event('db_updated'));
  },

  getMembersForCommittee(committeeId) {
    return this.cache.members.filter(m => m.committee_id === committeeId);
  },
  getScheduleForCommittee(committeeId) {
    return this.cache.schedule.filter(s => s.committee_id === committeeId).sort((a, b) => a.month_index - b.month_index);
  },

  // ---------- Committees ----------
  async addCommittee(committeeData, memberRows) {
    const { data: committee, error } = await supabaseClient.from('committees').insert([{
      user_id: this.user.id, name: committeeData.name, start_date: committeeData.start_date,
      total_months: committeeData.total_months, monthly_installment: committeeData.monthly_installment,
      pool_override: committeeData.pool_override
    }]).select().single();

    if (error) { alert('Failed to create committee: ' + error.message); return null; }

    const memberInserts = memberRows.filter(m => m.name.trim()).map(m => ({
      committee_id: committee.id, user_id: this.user.id, name: m.name.trim(), phone: m.phone.trim(), is_admin: !!m.isAdmin
    }));
    const { data: members, error: mErr } = memberInserts.length
      ? await supabaseClient.from('members').insert(memberInserts).select()
      : { data: [], error: null };
    if (mErr) { alert('Committee created but members failed: ' + mErr.message); }

    const scheduleKeys = buildScheduleKeys(committee.start_date, committee.total_months);
    const scheduleInserts = scheduleKeys.map((mk, i) => ({
      committee_id: committee.id, user_id: this.user.id, month_index: i + 1, month_key: mk,
      is_drawn: false, status: 'pending'
    }));
    const { data: schedule, error: sErr } = await supabaseClient.from('payout_schedule').insert(scheduleInserts).select();
    if (sErr) { alert('Committee created but schedule failed: ' + sErr.message); }

    this.cache.committees.unshift(committee);
    if (members) this.cache.members.push(...members);
    if (schedule) this.cache.schedule.push(...schedule);
    this._persist();
    window.dispatchEvent(new Event('db_updated'));
    return committee;
  },

  async deleteCommittee(committeeId) {
    const backup = JSON.parse(JSON.stringify(this.cache));
    this.cache.committees = this.cache.committees.filter(c => c.id !== committeeId);
    this.cache.members = this.cache.members.filter(m => m.committee_id !== committeeId);
    this.cache.schedule = this.cache.schedule.filter(s => s.committee_id !== committeeId);
    this.cache.transactions = this.cache.transactions.filter(t => t.committee_id !== committeeId);
    this._persist();
    window.dispatchEvent(new Event('db_updated'));

    const { error } = await supabaseClient.from('committees').delete().eq('id', committeeId);
    if (error) {
      console.error(error);
      this.cache = backup;
      this._persist();
      window.dispatchEvent(new Event('db_updated'));
      alert('Failed to delete committee: ' + error.message);
    }
  },

  // ---------- Payments (transactions) ----------
  // Replaces every inflow transaction for a given member+month with the given set of lines (supports split payments)
  async setPaymentLines(committeeId, memberId, monthKey, lines, notes, skipped) {
    const existing = this.cache.transactions.filter(t => t.committee_id === committeeId && t.member_id === memberId && t.month_key === monthKey && t.type === 'inflow_installment');
    if (existing.length) {
      const ids = existing.map(t => t.id);
      await supabaseClient.from('transactions').delete().in('id', ids);
      this.cache.transactions = this.cache.transactions.filter(t => !ids.includes(t.id));
    }

    const rowsToInsert = [];
    if (skipped) {
      rowsToInsert.push({
        committee_id: committeeId, member_id: memberId, user_id: this.user.id, type: 'inflow_installment',
        amount: 0, month_key: monthKey, transaction_date: todayDateStr(), notes: 'SKIPPED' + (notes ? ' | ' + notes : '')
      });
    } else {
      lines.forEach(line => {
        if (line.amount === '' || isNaN(Number(line.amount)) || Number(line.amount) <= 0) return;
        rowsToInsert.push({
          committee_id: committeeId, member_id: memberId, user_id: this.user.id, type: 'inflow_installment',
          amount: Number(line.amount), month_key: monthKey, transaction_date: line.date || todayDateStr(), notes: notes || ''
        });
      });
    }

    if (rowsToInsert.length) {
      const { data, error } = await supabaseClient.from('transactions').insert(rowsToInsert).select();
      if (error) { alert('Failed to save payment: ' + error.message); }
      else this.cache.transactions.push(...data);
    }
    this._persist();
    window.dispatchEvent(new Event('db_updated'));
  },

  // ---------- Payout schedule / Qurandazi ----------
  async assignDraw(scheduleId, memberId, drawType) {
    const committeeId = this.cache.schedule.find(s => s.id === scheduleId).committee_id;
    const committee = this.cache.committees.find(c => c.id === committeeId);
    const payoutAmount = computePool(committee);
    const patch = { member_id: memberId, is_drawn: true, draw_type: drawType, payout_amount: payoutAmount };

    const idx = this.cache.schedule.findIndex(s => s.id === scheduleId);
    if (idx > -1) this.cache.schedule[idx] = { ...this.cache.schedule[idx], ...patch };
    this._persist();
    window.dispatchEvent(new Event('db_updated'));

    const { error } = await supabaseClient.from('payout_schedule').update(patch).eq('id', scheduleId);
    if (error) { alert('Failed to save draw: ' + error.message); await this.syncFromServer(); }
  },

  async markPayoutPaid(scheduleId, amount, dateStr) {
    const row = this.cache.schedule.find(s => s.id === scheduleId);
    const patch = { status: 'paid', paid_at: new Date().toISOString(), payout_amount: amount };
    const idx = this.cache.schedule.findIndex(s => s.id === scheduleId);
    if (idx > -1) this.cache.schedule[idx] = { ...this.cache.schedule[idx], ...patch };
    this._persist();
    window.dispatchEvent(new Event('db_updated'));

    const { error } = await supabaseClient.from('payout_schedule').update(patch).eq('id', scheduleId);
    if (error) { alert('Failed to update schedule: ' + error.message); await this.syncFromServer(); return; }

    const txRow = {
      committee_id: row.committee_id, member_id: row.member_id, user_id: this.user.id, type: 'outflow_payout',
      amount: amount, month_key: row.month_key, transaction_date: dateStr, notes: `Payout for ${monthLabel(row.month_key)} (${row.draw_type || 'manual'})`
    };
    const { data, error: txErr } = await supabaseClient.from('transactions').insert([txRow]).select().single();
    if (txErr) { alert('Payout marked but transaction log failed: ' + txErr.message); return; }
    this.cache.transactions.push(data);
    this._persist();
    window.dispatchEvent(new Event('db_updated'));
  }
};
