// ============================================================
// Global helpers
// ============================================================
function todayDateStr() { return new Date().toISOString().split('T')[0]; }
function todayMonthKey() { return todayDateStr().substring(0, 7); }
function monthLabel(mk) {
  if (!mk) return '—';
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
function fmtMoney(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-' : '') + 'Rs ' + Math.abs(v).toLocaleString('en-PK');
}
function buildScheduleKeys(startDate, totalMonths) {
  function am(mk, n) {
    const [y, m] = mk.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  const s = startDate.substring(0, 7); const a = [];
  for (let i = 0; i < totalMonths; i++) a.push(am(s, i));
  return a;
}
function computeMemberCount(cid) {
  if (!DB?.cache?.members) return 0;
  return DB.cache.members.filter(m => m.committee_id === cid).length;
}
function computePool(c) {
  const n = computeMemberCount(c.id) || c.total_months;
  return c.pool_override != null ? Number(c.pool_override) : Number(c.monthly_installment) * n;
}
function computeCellStatus(c, memberId, mk) {
  if (!DB?.cache?.transactions) return { status: 'unpaid', paidSum: 0, due: 0, txs: [] };
  const txs = DB.cache.transactions.filter(t => t.member_id === memberId && t.month_key === mk && t.type === 'inflow_installment');
  const skipped = txs.some(t => (t.notes || '').toUpperCase().includes('SKIPPED'));
  const paidSum = txs.reduce((s, t) => s + Number(t.amount), 0);
  const due = Number(c.monthly_installment);
  if (skipped) return { status: 'skipped', paidSum, due, txs };
  if (paidSum <= 0) return { status: 'unpaid', paidSum, due, txs };
  if (paidSum < due) return { status: 'partial', paidSum, due, txs };
  return { status: 'full', paidSum, due, txs };
}
function computeMemberLedger(c, member) {
  const schedule = buildScheduleKeys(c.start_date, c.total_months);
  if (!DB?.cache?.schedule) return { rows: [], payoutRow: null, totalDue: 0, totalPaid: 0 };
  const payoutRow = DB.cache.schedule.find(s => s.member_id === member.id && s.committee_id === c.id);
  let cumulativePaid = 0;
  const rows = schedule.map(mk => {
    const cell = computeCellStatus(c, member.id, mk);
    cumulativePaid += cell.paidSum;
    const settled = payoutRow && payoutRow.status === 'paid' && payoutRow.month_key <= mk;
    const balance = cumulativePaid - (settled ? Number(payoutRow.payout_amount || 0) : 0);
    return { monthKey: mk, due: cell.due, paid: cell.paidSum, status: cell.status, cumulativePaid, balance, isPayoutMonth: payoutRow && payoutRow.month_key === mk };
  });
  return { rows, payoutRow, totalDue: schedule.length * Number(c.monthly_installment), totalPaid: cumulativePaid };
}

// ============================================================
// Theme
// ============================================================
function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  const btn = document.getElementById('theme-btn');
  const lbl = document.getElementById('theme-label');
  if (btn) btn.textContent = theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode';
  if (lbl) lbl.textContent = theme === 'light' ? 'Dark Mode' : 'Light Mode';
  if (btn) btn.innerHTML = (theme === 'light' ? '🌙 ' : '☀️ ') + (theme === 'light' ? 'Dark Mode' : 'Light Mode');
}
function toggleTheme() {
  const cur = localStorage.getItem('bcms_theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  localStorage.setItem('bcms_theme', next);
  applyTheme(next);
}
applyTheme(localStorage.getItem('bcms_theme') || 'dark');

// ============================================================
// State
// ============================================================
let activeCommitteeId = null;
let currentView = 'committees';
let views = {}, navs = {};

function activeCommittee() {
  if (!DB?.cache?.committees) return null;
  return DB.cache.committees.find(c => c.id === activeCommitteeId) || null;
}
function getCommitteeSelectEl() { return document.getElementById('active-committee-select'); }

function switchView(name) {
  if (!views[name]) return;
  if (name !== 'committees' && !activeCommittee()) {
    alert('Select or create a committee first.'); name = 'committees';
  }
  currentView = name;
  Object.values(views).forEach(v => v.classList.add('hidden'));
  Object.values(navs).forEach(n => n.classList.remove('active'));
  views[name].classList.remove('hidden');
  navs[name].classList.add('active');
  // close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
  renderCurrentView();
  window.scrollTo(0, 0);
}
function renderCurrentView() {
  if (!views || !Object.keys(views).length) return;
  const map = { committees: renderCommitteesView, dashboard: renderDashboardView, matrix: renderMatrixView, qurandazi: renderQurandaziView, reports: renderReportsView };
  if (map[currentView]) map[currentView]();
}

// ============================================================
// DOMContentLoaded — init everything
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {

  // Theme
  document.getElementById('theme-btn').addEventListener('click', toggleTheme);

  // Mobile hamburger
  document.getElementById('hamburger-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('open');
  });
  document.getElementById('sidebar-overlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  });

  // Views / navs
  views = {
    committees: document.getElementById('view-committees'),
    dashboard: document.getElementById('view-dashboard'),
    matrix: document.getElementById('view-matrix'),
    qurandazi: document.getElementById('view-qurandazi'),
    reports: document.getElementById('view-reports')
  };
  navs = {
    committees: document.getElementById('nav-committees'),
    dashboard: document.getElementById('nav-dashboard'),
    matrix: document.getElementById('nav-matrix'),
    qurandazi: document.getElementById('nav-qurandazi'),
    reports: document.getElementById('nav-reports')
  };

  // Auth init
  const ok = await DB.init();
  if (ok) {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    window.dispatchEvent(new Event('db_updated'));
  }

  // Nav listeners
  navs.committees.addEventListener('click', e => { e.preventDefault(); switchView('committees'); });
  navs.dashboard.addEventListener('click', e => { e.preventDefault(); switchView('dashboard'); });
  navs.matrix.addEventListener('click', e => { e.preventDefault(); switchView('matrix'); });
  navs.qurandazi.addEventListener('click', e => { e.preventDefault(); switchView('qurandazi'); });
  navs.reports.addEventListener('click', e => { e.preventDefault(); switchView('reports'); });

  // Committee select
  getCommitteeSelectEl().addEventListener('change', () => {
    activeCommitteeId = getCommitteeSelectEl().value;
    renderCurrentView();
  });

  // Quick actions
  document.getElementById('qa-record-payment').addEventListener('click', () => openPayModal(null, null));
  document.getElementById('qa-run-qurandazi').addEventListener('click', () => switchView('qurandazi'));

  // Matrix search
  document.getElementById('matrix-search').addEventListener('input', renderMatrixView);
  document.getElementById('matrix-export-btn').addEventListener('click', exportMatrixPdf);
});

// ============================================================
// Auth
// ============================================================
document.getElementById('login-btn').addEventListener('click', async () => {
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: document.getElementById('email').value,
    password: document.getElementById('password').value
  });
  if (error) alert(error.message); else if (await DB.init()) location.reload();
});
document.getElementById('signup-btn').addEventListener('click', async () => {
  const { error } = await supabaseClient.auth.signUp({
    email: document.getElementById('email').value,
    password: document.getElementById('password').value
  });
  if (error) alert(error.message); else alert('Account created! Please log in.');
});
document.getElementById('logout-btn').addEventListener('click', async e => {
  e.preventDefault();
  await supabaseClient.auth.signOut();
  DB.user = null;
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
});

// ============================================================
// DB updated — refresh sidebar selector
// ============================================================
window.addEventListener('db_updated', () => {
  const sel = getCommitteeSelectEl();
  if (!sel || !DB?.cache?.committees) return;
  sel.innerHTML = DB.cache.committees.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  if (!activeCommitteeId && DB.cache.committees[0]) activeCommitteeId = DB.cache.committees[0].id;
  if (activeCommitteeId) sel.value = activeCommitteeId;
  renderCurrentView();
});

// ============================================================
// COMMITTEES VIEW
// ============================================================
function renderCommitteesView() {
  const grid = document.getElementById('committees-grid');
  if (!grid) return;
  grid.innerHTML = '';
  if (!DB.cache.committees.length) {
    grid.innerHTML = '<p class="muted">No committees yet. Click "+ New Committee" to get started.</p>';
    return;
  }
  DB.cache.committees.forEach(c => {
    const members = DB.getMembersForCommittee(c.id);
    const pool = computePool(c);
    const scheduleKeys = buildScheduleKeys(c.start_date, c.total_months);
    const today = todayMonthKey();
    const activeMk = scheduleKeys.reduce((acc, mk) => (mk <= today ? mk : acc), scheduleKeys[0]);
    const collected = DB.cache.transactions.filter(t => t.committee_id === c.id && t.month_key === activeMk && t.type === 'inflow_installment').reduce((s, t) => s + Number(t.amount), 0);
    const expected = members.length * Number(c.monthly_installment);
    const pct = expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0;
    const card = document.createElement('div');
    card.className = 'committee-card';
    card.innerHTML = `
      <h3>${c.name}</h3>
      <div class="pill-row">
        <span class="pill accent">👥 ${members.length} members</span>
        <span class="pill accent">📅 ${c.total_months} months</span>
        <span class="pill success">💰 ${fmtMoney(pool)} pool</span>
      </div>
      <p style="margin-top:10px; font-size:0.83rem; color:var(--text2);">
        ${fmtMoney(c.monthly_installment)}/month · Starts ${c.start_date}
      </p>
      <div style="margin:12px 0;">
        <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:var(--text2); margin-bottom:5px;">
          <span>Collection ${monthLabel(activeMk)}</span>
          <span>${pct}%</span>
        </div>
        <div style="height:6px; background:var(--surface3); border-radius:999px; overflow:hidden;">
          <div style="height:100%; width:${pct}%; background:${pct===100?'var(--success)':pct>50?'var(--warning)':'var(--danger)'}; border-radius:999px; transition:width 0.6s ease;"></div>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn-primary btn-sm" data-action="open">📂 Open</button>
        <button class="btn-secondary btn-sm" data-action="edit">✏️ Edit</button>
        <button class="btn-danger btn-sm" data-action="delete">🗑️ Delete</button>
      </div>
    `;
    card.querySelector('[data-action="open"]').addEventListener('click', () => {
      activeCommitteeId = c.id;
      const sel = getCommitteeSelectEl();
      if (sel) sel.value = c.id;
      switchView('dashboard');
    });
    card.querySelector('[data-action="edit"]').addEventListener('click', e => { e.stopPropagation(); openEditCommitteeModal(c); });
    card.querySelector('[data-action="delete"]').addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(`Delete "${c.name}" permanently?\nThis removes all members, schedule and payments.`)) return;
      if (activeCommitteeId === c.id) activeCommitteeId = null;
      await DB.deleteCommittee(c.id);
    });
    grid.appendChild(card);
  });
}

document.getElementById('add-committee-btn').addEventListener('click', openNewCommitteeModal);

// ---- New Committee Modal ----
function openNewCommitteeModal() {
  document.getElementById('cm-name').value = '';
  document.getElementById('cm-start').value = todayDateStr();
  document.getElementById('cm-months').value = 10;
  document.getElementById('cm-installment').value = '';
  document.getElementById('cm-pool-override').value = '';
  const list = document.getElementById('cm-members-list');
  list.innerHTML = '';
  addNewMemberRow(); addNewMemberRow(); addNewMemberRow();
  document.getElementById('committee-modal').classList.remove('hidden');
}
function addNewMemberRow(name = '', phone = '') {
  const list = document.getElementById('cm-members-list');
  const row = document.createElement('div');
  row.className = 'member-row';
  row.innerHTML = `
    <input type="text" class="mr-name" placeholder="Member name" value="${name}" style="margin-bottom:0;">
    <input type="text" class="mr-phone" placeholder="Phone (92xxxxxxxxxx)" value="${phone}" style="margin-bottom:0;">
    <button type="button" class="btn-secondary btn-sm mr-remove">✕</button>
  `;
  row.querySelector('.mr-remove').addEventListener('click', () => row.remove());
  list.appendChild(row);
}
document.getElementById('cm-add-member-row-btn').addEventListener('click', () => addNewMemberRow());
document.getElementById('cm-cancel-btn').addEventListener('click', () => document.getElementById('committee-modal').classList.add('hidden'));
document.getElementById('cm-save-btn').addEventListener('click', async () => {
  const name = document.getElementById('cm-name').value.trim();
  const start = document.getElementById('cm-start').value;
  const months = Number(document.getElementById('cm-months').value);
  const installment = Number(document.getElementById('cm-installment').value);
  const poolOverride = document.getElementById('cm-pool-override').value;
  if (!name || !start || !months || !installment) { alert('Please fill in name, start date, months and installment.'); return; }
  const memberRows = Array.from(document.querySelectorAll('#cm-members-list .member-row')).map(r => ({
    name: r.querySelector('.mr-name').value.trim(),
    phone: r.querySelector('.mr-phone').value.trim()
  })).filter(m => m.name);
  if (!memberRows.length) { alert('Add at least one member.'); return; }
  document.getElementById('committee-modal').classList.add('hidden');
  const c = await DB.addCommittee({ name, start_date: start, total_months: months, monthly_installment: installment, pool_override: poolOverride === '' ? null : Number(poolOverride) }, memberRows);
  if (c) { activeCommitteeId = c.id; switchView('dashboard'); }
});

// ---- Edit Committee Modal ----
function openEditCommitteeModal(c) {
  document.getElementById('ecm-name').value = c.name;
  document.getElementById('ecm-start').value = c.start_date;
  document.getElementById('ecm-months').value = c.total_months;
  document.getElementById('ecm-installment').value = c.monthly_installment;
  document.getElementById('ecm-pool-override').value = c.pool_override || '';
  const list = document.getElementById('ecm-members-list');
  list.innerHTML = '';
  DB.getMembersForCommittee(c.id).forEach(m => addEditMemberRow(m.id, m.name, m.phone));
  document.getElementById('edit-committee-modal').dataset.committeeId = c.id;
  document.getElementById('edit-committee-modal').classList.remove('hidden');
}
function addEditMemberRow(id = '', name = '', phone = '') {
  const list = document.getElementById('ecm-members-list');
  const row = document.createElement('div');
  row.className = 'member-edit-row';
  row.dataset.memberId = id;
  row.innerHTML = `
    <input type="text" class="ecm-mr-name" placeholder="Member name" value="${name || ''}" style="margin-bottom:0;">
    <input type="text" class="ecm-mr-phone" placeholder="Phone" value="${phone || ''}" style="margin-bottom:0;">
    <button type="button" class="btn-danger btn-sm ecm-mr-remove">✕</button>
  `;
  row.querySelector('.ecm-mr-remove').addEventListener('click', () => row.remove());
  list.appendChild(row);
}
document.getElementById('ecm-add-member-btn').addEventListener('click', () => addEditMemberRow());
document.getElementById('ecm-cancel-btn').addEventListener('click', () => document.getElementById('edit-committee-modal').classList.add('hidden'));
document.getElementById('ecm-save-btn').addEventListener('click', async () => {
  const cid = document.getElementById('edit-committee-modal').dataset.committeeId;
  const name = document.getElementById('ecm-name').value.trim();
  const start = document.getElementById('ecm-start').value;
  const months = Number(document.getElementById('ecm-months').value);
  const installment = Number(document.getElementById('ecm-installment').value);
  const poolOverride = document.getElementById('ecm-pool-override').value;
  if (!name || !start || !months || !installment) { alert('Please fill all required fields.'); return; }
  document.getElementById('edit-committee-modal').classList.add('hidden');
  await DB.updateCommittee(cid, { name, start_date: start, total_months: months, monthly_installment: installment, pool_override: poolOverride === '' ? null : Number(poolOverride) });
  const rows = Array.from(document.querySelectorAll('#ecm-members-list .member-edit-row'));
  for (const row of rows) {
    const mId = row.dataset.memberId;
    const mName = row.querySelector('.ecm-mr-name').value.trim();
    const mPhone = row.querySelector('.ecm-mr-phone').value.trim();
    if (!mName) continue;
    if (mId) { await DB.updateMember(mId, { name: mName, phone: mPhone }); }
    else { await DB.addMember(cid, mName, mPhone); }
  }
  await DB.syncFromServer();
});

// ============================================================
// DASHBOARD VIEW
// ============================================================
function renderDashboardView() {
  const c = activeCommittee(); if (!c) return;
  const members = DB.getMembersForCommittee(c.id);
  const schedule = DB.getScheduleForCommittee(c.id);
  const keys = buildScheduleKeys(c.start_date, c.total_months);
  const today = todayMonthKey();
  const activeMk = keys.reduce((acc, mk) => (mk <= today ? mk : acc), keys[0]);

  document.getElementById('dash-committee-name').textContent = c.name;
  document.getElementById('dash-committee-sub').textContent =
    `${members.length} members · ${c.total_months} months · ${fmtMoney(c.monthly_installment)}/month · Pool ${fmtMoney(computePool(c))}`;

  const expected = members.length * Number(c.monthly_installment);
  const collected = DB.cache.transactions.filter(t => t.committee_id === c.id && t.month_key === activeMk && t.type === 'inflow_installment').reduce((s, t) => s + Number(t.amount), 0);
  const disbursed = DB.cache.transactions.filter(t => t.committee_id === c.id && t.type === 'outflow_payout').reduce((s, t) => s + Number(t.amount), 0);
  const deficit = expected - collected;

  document.getElementById('stat-expected').textContent = fmtMoney(expected);
  document.getElementById('stat-collected').textContent = fmtMoney(collected);
  document.getElementById('stat-disbursed').textContent = fmtMoney(disbursed);
  const defEl = document.getElementById('stat-deficit');
  defEl.textContent = fmtMoney(deficit);
  defEl.className = deficit > 0 ? 'negative' : 'positive';

  // Next in line
  const nextRow = schedule.find(s => s.month_key === activeMk) || schedule.find(s => s.status === 'pending');
  const nextBody = document.getElementById('next-in-line-body');
  if (!nextRow) { nextBody.innerHTML = '<p class="muted">Schedule not set up yet.</p>'; }
  else if (!nextRow.member_id) {
    nextBody.innerHTML = `<p class="muted" style="margin-bottom:10px;">Month: <strong>${monthLabel(nextRow.month_key)}</strong> — winner not yet drawn.</p>
      <button class="btn-primary btn-sm" onclick="switchView('qurandazi')">🎟️ Run Qurandazi Now</button>`;
  } else {
    const w = members.find(m => m.id === nextRow.member_id);
    nextBody.innerHTML = `
      <div class="next-winner-name">${w ? w.name : 'Unknown'}</div>
      <p class="muted" style="margin-top:6px;">${monthLabel(nextRow.month_key)} · ${fmtMoney(nextRow.payout_amount)}
      · <span class="badge ${nextRow.status === 'paid' ? 'badge-success' : 'badge-warning'}">${nextRow.status}</span></p>`;
  }

  // Lagging members
  const adminDetails = localStorage.getItem('bcms_admin_details_' + c.id) || '';
  const laggingWrap = document.getElementById('lagging-list');
  laggingWrap.innerHTML = '';
  const lagging = members.filter(m => { const cell = computeCellStatus(c, m.id, activeMk); return cell.status === 'unpaid' || cell.status === 'partial'; });
  if (!lagging.length) { laggingWrap.innerHTML = '<p class="muted">✅ Everyone is paid up this month!</p>'; return; }
  lagging.forEach(m => {
    const cell = computeCellStatus(c, m.id, activeMk);
    const owes = cell.due - cell.paidSum;
    const row = document.createElement('div');
    row.className = 'lagging-row';
    row.innerHTML = `
      <div>
        <strong>${m.name}</strong> &nbsp;
        <span class="badge ${cell.status === 'partial' ? 'badge-warning' : 'badge-danger'}">${cell.status}</span>
        <span class="muted" style="margin-left:8px;">Owes ${fmtMoney(owes)}</span>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn-secondary btn-sm" data-whatsapp>📱 WhatsApp</button>
        <button class="btn-primary btn-sm" data-pay>💳 Pay Now</button>
      </div>
    `;
    row.querySelector('[data-whatsapp]').addEventListener('click', () => sendWhatsAppReminder(c, m, activeMk, owes, adminDetails));
    row.querySelector('[data-pay]').addEventListener('click', () => openPayModal(m.id, activeMk));
    laggingWrap.appendChild(row);
  });
}

function sendWhatsAppReminder(c, member, mk, amountDue, adminDetails) {
  if (!member.phone) { alert('No phone number for this member.'); return; }
  const phone = member.phone.replace(/[^0-9]/g, '');
  let msg = `Assalam-o-Alaikum ${member.name},\n\nYour BC installment for *${c.name}* (${monthLabel(mk)}) is pending.\n*Amount due: ${fmtMoney(amountDue)}*\n`;
  if (adminDetails) msg += `\nPlease pay to:\n${adminDetails}\n`;
  msg += `\nJazakAllah Khair 🙏`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ============================================================
// COLLECTION MATRIX VIEW
// ============================================================
function renderMatrixView() {
  const c = activeCommittee(); if (!c) return;
  const allMembers = DB.getMembersForCommittee(c.id);
  const filter = (document.getElementById('matrix-search')?.value || '').toLowerCase();
  const members = filter ? allMembers.filter(m => m.name.toLowerCase().includes(filter)) : allMembers;
  const keys = buildScheduleKeys(c.start_date, c.total_months);
  const schedule = DB.getScheduleForCommittee(c.id);
  const payoutMonthSet = new Set(schedule.filter(s => s.member_id).map(s => s.month_key + '::' + s.member_id));

  // Summary bar
  const today = todayMonthKey();
  const activeMk = keys.reduce((acc, mk) => (mk <= today ? mk : acc), keys[0]);
  let totalFull = 0, totalPartial = 0, totalUnpaid = 0, totalCollected = 0;
  allMembers.forEach(m => {
    keys.forEach(mk => {
      const cell = computeCellStatus(c, m.id, mk);
      if (cell.status === 'full') totalFull++;
      else if (cell.status === 'partial') totalPartial++;
      else if (cell.status === 'unpaid') totalUnpaid++;
      totalCollected += cell.paidSum;
    });
  });
  const summaryEl = document.getElementById('matrix-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="matrix-summary-box"><div class="msb-val" style="color:var(--success);">${totalFull}</div><div class="msb-lbl">Fully Paid</div></div>
      <div class="matrix-summary-box"><div class="msb-val" style="color:var(--warning);">${totalPartial}</div><div class="msb-lbl">Partial</div></div>
      <div class="matrix-summary-box"><div class="msb-val" style="color:var(--danger);">${totalUnpaid}</div><div class="msb-lbl">Unpaid</div></div>
      <div class="matrix-summary-box"><div class="msb-val" style="color:var(--accent);">${fmtMoney(totalCollected)}</div><div class="msb-lbl">Total Collected</div></div>
    `;
  }

  // Build table
  const table = document.getElementById('matrix-table');
  const thead = `<thead><tr>
    <th class="member-col">Member</th>
    ${keys.map((mk, i) => `<th style="text-align:center;">M${i+1}<br><span style="font-weight:400;font-size:0.65rem;">${monthLabel(mk)}</span></th>`).join('')}
    <th>Total Paid</th>
  </tr></thead>`;

  let tbody = '<tbody>';
  members.forEach(m => {
    let memberTotal = 0;
    const cells = keys.map(mk => {
      const cell = computeCellStatus(c, m.id, mk);
      memberTotal += cell.paidSum;
      const isPayoutMk = payoutMonthSet.has(mk + '::' + m.id);
      const label = cell.status === 'full' ? '✓' : cell.status === 'partial' ? '½' : cell.status === 'skipped' ? '—' : '✕';
      const amtLabel = cell.paidSum > 0 ? `<div class="matrix-cell-amount">${(cell.paidSum/1000).toFixed(0)}k</div>` : '';
      return `<td><div class="matrix-cell ${cell.status}${isPayoutMk ? ' payout-month' : ''}" data-member="${m.id}" data-month="${mk}" title="${m.name} · ${monthLabel(mk)} · ${cell.status} · Paid ${fmtMoney(cell.paidSum)}">${label}${amtLabel}</div></td>`;
    }).join('');
    tbody += `<tr><td class="member-col">${m.name}${m.phone ? `<br><span style="font-size:0.72rem;color:var(--text3);">${m.phone}</span>` : ''}</td>${cells}<td style="font-weight:700;font-family:var(--mono);font-size:0.85rem;">${fmtMoney(memberTotal)}</td></tr>`;
  });
  tbody += '</tbody>';
  table.innerHTML = thead + tbody;

  table.querySelectorAll('.matrix-cell').forEach(cell => {
    cell.addEventListener('click', () => openPayModal(cell.dataset.member, cell.dataset.month));
  });
}

function exportMatrixPdf() {
  const c = activeCommittee(); if (!c) return;
  const members = DB.getMembersForCommittee(c.id);
  const keys = buildScheduleKeys(c.start_date, c.total_months);
  const statusIcon = { full: '✓', partial: '½', unpaid: '✕', skipped: '—' };
  const statusColor = { full: '#059669', partial: '#d97706', unpaid: '#dc2626', skipped: '#6b7280' };
  let rows = members.map(m => {
    const cells = keys.map(mk => {
      const cell = computeCellStatus(c, m.id, mk);
      return `<td style="text-align:center;background:${statusColor[cell.status]}20;color:${statusColor[cell.status]};font-weight:700;">${statusIcon[cell.status]}</td>`;
    }).join('');
    return `<tr><td style="font-weight:600;">${m.name}</td>${cells}</tr>`;
  }).join('');
  const html = `<div class="pdf-doc" style="width:100%;">
    <h1>${c.name} — Collection Matrix</h1>
    <p class="pdf-meta">Generated: ${todayDateStr()} · ${members.length} members · ${c.total_months} months</p>
    <table><thead><tr><th>Member</th>${keys.map((mk,i) => `<th style="text-align:center;">M${i+1}<br>${monthLabel(mk)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
  </div>`;
  renderPdf(html, `${c.name.replace(/\s+/g,'_')}_matrix.pdf`);
}

// ============================================================
// PAYMENT MODAL
// ============================================================
function openPayModal(memberId, monthKey) {
  const c = activeCommittee(); if (!c) return;
  const members = DB.getMembersForCommittee(c.id);
  const keys = buildScheduleKeys(c.start_date, c.total_months);
  const mSel = document.getElementById('pay-member-select');
  const mkSel = document.getElementById('pay-month-select');
  mSel.innerHTML = members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  mkSel.innerHTML = keys.map(mk => `<option value="${mk}">${monthLabel(mk)}</option>`).join('');
  if (memberId) mSel.value = memberId;
  if (monthKey) mkSel.value = monthKey;
  loadPayModalData();
  mSel.onchange = loadPayModalData;
  mkSel.onchange = loadPayModalData;
  document.getElementById('pay-modal').classList.remove('hidden');
}
function loadPayModalData() {
  const c = activeCommittee();
  const memberId = document.getElementById('pay-member-select').value;
  const mk = document.getElementById('pay-month-select').value;
  const m = DB.cache.members.find(x => x.id === memberId);
  document.getElementById('pay-modal-title').textContent = m ? `💳 ${m.name} — ${monthLabel(mk)}` : '💳 Record Payment';
  const txs = DB.cache.transactions.filter(t => t.committee_id === c.id && t.member_id === memberId && t.month_key === mk && t.type === 'inflow_installment');
  const skipped = txs.some(t => (t.notes || '').toUpperCase().includes('SKIPPED'));
  document.getElementById('pay-notes').value = txs.length ? (txs[0].notes || '').replace(/^SKIPPED\s*\|?\s*/i, '') : '';
  document.getElementById('pay-skipped').checked = skipped;
  const linesWrap = document.getElementById('pay-lines');
  linesWrap.innerHTML = '';
  const lines = (!skipped && txs.length) ? txs.map(t => ({ amount: t.amount, date: t.transaction_date })) : [{ amount: '', date: todayDateStr() }];
  lines.forEach(l => addPayLine(l.amount, l.date));
}
function addPayLine(amount = '', date = '') {
  const wrap = document.getElementById('pay-lines');
  const row = document.createElement('div');
  row.className = 'payment-line';
  row.innerHTML = `
    <input type="number" class="pl-amount" placeholder="Amount (Rs)" value="${amount}" style="margin-bottom:0;">
    <input type="date" class="pl-date" value="${date || todayDateStr()}" style="margin-bottom:0;">
    <button type="button" class="btn-secondary btn-sm pl-remove">✕</button>
  `;
  row.querySelector('.pl-remove').addEventListener('click', () => row.remove());
  wrap.appendChild(row);
}
document.getElementById('pay-add-line-btn').addEventListener('click', () => addPayLine());
document.getElementById('pay-cancel-btn').addEventListener('click', () => document.getElementById('pay-modal').classList.add('hidden'));
document.getElementById('pay-save-btn').addEventListener('click', async () => {
  const c = activeCommittee();
  const memberId = document.getElementById('pay-member-select').value;
  const mk = document.getElementById('pay-month-select').value;
  const notes = document.getElementById('pay-notes').value;
  const skipped = document.getElementById('pay-skipped').checked;
  const lines = Array.from(document.querySelectorAll('#pay-lines .payment-line')).map(r => ({ amount: r.querySelector('.pl-amount').value, date: r.querySelector('.pl-date').value }));
  document.getElementById('pay-modal').classList.add('hidden');
  await DB.setPaymentLines(c.id, memberId, mk, lines, notes, skipped);
});

// ============================================================
// QURANDAZI VIEW
// ============================================================
function renderQurandaziView() {
  const c = activeCommittee(); if (!c) return;
  const schedule = DB.getScheduleForCommittee(c.id);
  const members = DB.getMembersForCommittee(c.id);
  const drawnIds = new Set(schedule.filter(s => s.member_id).map(s => s.member_id));
  const eligible = members.filter(m => !drawnIds.has(m.id));
  const undrawn = schedule.filter(s => !s.member_id);

  const mkSel = document.getElementById('qd-month-select');
  mkSel.innerHTML = undrawn.length ? undrawn.map(s => `<option value="${s.id}">${monthLabel(s.month_key)}</option>`).join('') : '<option>All months assigned</option>';

  document.getElementById('qd-run-draw-btn').disabled = !undrawn.length || !eligible.length;
  document.getElementById('qd-manual-member-select').innerHTML = eligible.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  document.getElementById('qd-draw-box').classList.add('hidden');
  document.getElementById('qd-winner').classList.add('hidden');
  document.getElementById('qd-manual-wrap').classList.add('hidden');

  const tbody = document.getElementById('qd-schedule-body');
  tbody.innerHTML = '';
  schedule.forEach(s => {
    const member = members.find(m => m.id === s.member_id);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${monthLabel(s.month_key)}</strong></td>
      <td>${member ? member.name : '<span class="muted">Not drawn</span>'}</td>
      <td>${s.draw_type ? `<span class="badge badge-accent">${s.draw_type}</span>` : '—'}</td>
      <td>${s.payout_amount != null ? fmtMoney(s.payout_amount) : '—'}</td>
      <td><span class="badge ${s.status === 'paid' ? 'badge-success' : 'badge-warning'}">${s.status}</span></td>
      <td>${(s.member_id && s.status === 'pending') ? '<button class="btn-success btn-sm">✅ Mark Paid</button>' : ''}</td>
    `;
    if (s.member_id && s.status === 'pending') tr.querySelector('button').addEventListener('click', () => openPayoutModal(s));
    tbody.appendChild(tr);
  });
}
document.getElementById('qd-manual-toggle-btn').addEventListener('click', () => document.getElementById('qd-manual-wrap').classList.toggle('hidden'));
document.getElementById('qd-manual-confirm-btn').addEventListener('click', async () => {
  const scheduleId = document.getElementById('qd-month-select').value;
  const memberId = document.getElementById('qd-manual-member-select').value;
  if (!scheduleId || !memberId) { alert('Select a month and a member.'); return; }
  await DB.assignDraw(scheduleId, memberId, 'manual');
  renderQurandaziView();
});
document.getElementById('qd-run-draw-btn').addEventListener('click', () => {
  const c = activeCommittee();
  const scheduleId = document.getElementById('qd-month-select').value;
  if (!scheduleId) return;
  const schedule = DB.getScheduleForCommittee(c.id);
  const members = DB.getMembersForCommittee(c.id);
  const drawnIds = new Set(schedule.filter(s => s.member_id).map(s => s.member_id));
  const eligible = members.filter(m => !drawnIds.has(m.id));
  if (!eligible.length) { alert('No eligible members left.'); return; }
  const box = document.getElementById('qd-draw-box');
  const slipsWrap = document.getElementById('qd-slips');
  const winnerWrap = document.getElementById('qd-winner');
  box.classList.remove('hidden');
  winnerWrap.classList.add('hidden');
  slipsWrap.innerHTML = eligible.map(m => `<div class="slip" data-member="${m.id}">${m.name}</div>`).join('');
  document.getElementById('qd-run-draw-btn').disabled = true;
  const winner = eligible[Math.floor(Math.random() * eligible.length)];
  setTimeout(async () => {
    slipsWrap.querySelectorAll('.slip').forEach(slip => {
      if (slip.dataset.member !== winner.id) slip.classList.add('settled');
    });
    winnerWrap.textContent = `🎉 ${winner.name} wins this round!`;
    winnerWrap.classList.remove('hidden');
    await DB.assignDraw(scheduleId, winner.id, 'qurandazi');
    document.getElementById('qd-run-draw-btn').disabled = false;
    setTimeout(() => renderQurandaziView(), 2000);
  }, 2000);
});
function openPayoutModal(scheduleRow) {
  const member = DB.cache.members.find(m => m.id === scheduleRow.member_id);
  document.getElementById('payout-modal-info').textContent = `${member ? member.name : 'Member'} — ${monthLabel(scheduleRow.month_key)}`;
  document.getElementById('payout-amount-input').value = scheduleRow.payout_amount || 0;
  document.getElementById('payout-date-input').value = todayDateStr();
  document.getElementById('payout-modal').dataset.scheduleId = scheduleRow.id;
  document.getElementById('payout-modal').classList.remove('hidden');
}
document.getElementById('payout-cancel-btn').addEventListener('click', () => document.getElementById('payout-modal').classList.add('hidden'));
document.getElementById('payout-confirm-btn').addEventListener('click', async () => {
  const sid = document.getElementById('payout-modal').dataset.scheduleId;
  const amount = Number(document.getElementById('payout-amount-input').value);
  const date = document.getElementById('payout-date-input').value;
  document.getElementById('payout-modal').classList.add('hidden');
  await DB.markPayoutPaid(sid, amount, date);
  renderQurandaziView();
});

// ============================================================
// REPORTS VIEW
// ============================================================
function renderReportsView() {
  const c = activeCommittee(); if (!c) return;
  const members = DB.getMembersForCommittee(c.id);
  document.getElementById('report-member-select').innerHTML = members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  document.getElementById('admin-payment-details').value = localStorage.getItem('bcms_admin_details_' + c.id) || '';
}
document.getElementById('save-admin-details-btn').addEventListener('click', () => {
  const c = activeCommittee();
  localStorage.setItem('bcms_admin_details_' + c.id, document.getElementById('admin-payment-details').value);
  alert('Saved!');
});
document.getElementById('export-member-pdf-btn').addEventListener('click', () => {
  const c = activeCommittee();
  if (!c) { alert('No active committee.'); return; }
  const memberId = document.getElementById('report-member-select').value;
  const member = DB.cache.members.find(m => m.id === memberId);
  if (!member) { alert('Select a member first.'); return; }
  const ledger = computeMemberLedger(c, member);
  const statusColor = { full: '#059669', partial: '#d97706', unpaid: '#dc2626', skipped: '#6b7280' };

  const rowsHtml = ledger.rows.map(r => `<tr>
    <td style="padding:8px 10px;border:1px solid #ddd;font-weight:600;">${monthLabel(r.monthKey)}</td>
    <td style="padding:8px 10px;border:1px solid #ddd;">${fmtMoney(r.due)}</td>
    <td style="padding:8px 10px;border:1px solid #ddd;color:#059669;font-weight:600;">${fmtMoney(r.paid)}</td>
    <td style="padding:8px 10px;border:1px solid #ddd;color:${statusColor[r.status]};font-weight:700;text-transform:capitalize;">${r.status}${r.isPayoutMonth ? ' 🏆' : ''}</td>
    <td style="padding:8px 10px;border:1px solid #ddd;font-weight:700;color:${r.balance < 0 ? '#dc2626' : '#059669'};">${fmtMoney(r.balance)}</td>
  </tr>`).join('');

  const pr = ledger.payoutRow;
  const html = `
    <div style="width:680px;padding:32px;background:#ffffff;color:#111111;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;">
      <div style="border-bottom:3px solid #4f46e5;padding-bottom:14px;margin-bottom:20px;">
        <h1 style="margin:0 0 4px;font-size:20px;">${c.name} — Member Ledger</h1>
        <p style="margin:0;color:#555;font-size:13px;">
          <strong>${member.name}</strong>${member.phone ? ' · ' + member.phone : ''} &nbsp;|&nbsp;
          Generated: ${todayDateStr()} &nbsp;|&nbsp; ${fmtMoney(c.monthly_installment)}/month · ${c.total_months} months
        </p>
      </div>

      <div style="background:#f5f5f5;border-radius:6px;padding:12px 16px;margin-bottom:20px;">
        <strong>Payout Assignment: </strong>
        ${pr && pr.member_id
          ? `${monthLabel(pr.month_key)} · ${fmtMoney(pr.payout_amount)} · <span style="color:${pr.status==='paid'?'#059669':'#d97706'};font-weight:700;">${pr.status}</span>`
          : 'Not yet assigned.'}
      </div>

      <h2 style="font-size:14px;margin:0 0 10px;border-bottom:1px solid #ddd;padding-bottom:6px;">Monthly Ledger</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead>
          <tr style="background:#f0f0f0;">
            <th style="text-align:left;padding:9px 10px;border:1px solid #ddd;font-size:12px;">Month</th>
            <th style="text-align:left;padding:9px 10px;border:1px solid #ddd;font-size:12px;">Due</th>
            <th style="text-align:left;padding:9px 10px;border:1px solid #ddd;font-size:12px;">Paid</th>
            <th style="text-align:left;padding:9px 10px;border:1px solid #ddd;font-size:12px;">Status</th>
            <th style="text-align:left;padding:9px 10px;border:1px solid #ddd;font-size:12px;">Balance</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr style="background:#e8e8e8;font-weight:700;">
            <td style="padding:9px 10px;border:1px solid #ddd;">Total</td>
            <td style="padding:9px 10px;border:1px solid #ddd;">${fmtMoney(ledger.totalDue)}</td>
            <td style="padding:9px 10px;border:1px solid #ddd;color:#059669;">${fmtMoney(ledger.totalPaid)}</td>
            <td style="padding:9px 10px;border:1px solid #ddd;"></td>
            <td style="padding:9px 10px;border:1px solid #ddd;color:${ledger.totalDue - ledger.totalPaid > 0 ? '#dc2626' : '#059669'};">${fmtMoney(ledger.totalDue - ledger.totalPaid)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  renderPdf(html, `${c.name.replace(/\s+/g,'_')}_${member.name.replace(/\s+/g,'_')}_ledger_${todayDateStr()}.pdf`);
});
document.getElementById('export-master-pdf-btn').addEventListener('click', () => {
  const c = activeCommittee();
  if (!c) { alert('No active committee.'); return; }
  const members = DB.getMembersForCommittee(c.id);
  const keys = buildScheduleKeys(c.start_date, c.total_months);
  let cumCash = 0;
  let totalInflow = 0, totalOutflow = 0;

  const rows = keys.map(mk => {
    const inflow  = DB.cache.transactions.filter(t => t.committee_id === c.id && t.month_key === mk && t.type === 'inflow_installment').reduce((s, t) => s + Number(t.amount), 0);
    const outflow = DB.cache.transactions.filter(t => t.committee_id === c.id && t.month_key === mk && t.type === 'outflow_payout').reduce((s, t) => s + Number(t.amount), 0);
    cumCash += inflow - outflow;
    totalInflow += inflow; totalOutflow += outflow;
    const netColor = (inflow - outflow) >= 0 ? '#059669' : '#dc2626';
    const cumColor = cumCash >= 0 ? '#059669' : '#dc2626';
    return `<tr>
      <td style="font-weight:600;">${monthLabel(mk)}</td>
      <td style="color:#059669;font-weight:600;">${inflow > 0 ? fmtMoney(inflow) : '—'}</td>
      <td style="color:#dc2626;font-weight:600;">${outflow > 0 ? fmtMoney(outflow) : '—'}</td>
      <td style="color:${netColor};font-weight:600;">${fmtMoney(inflow - outflow)}</td>
      <td style="color:${cumColor};font-weight:700;">${fmtMoney(cumCash)}</td>
    </tr>`;
  }).join('');

  const expectedTotal = members.length * Number(c.monthly_installment) * keys.length;
  const collectionRate = expectedTotal > 0 ? Math.round((totalInflow / expectedTotal) * 100) : 0;

  const html = `
    <div style="width:720px;padding:32px;background:#ffffff;color:#111111;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;">
      <div style="border-bottom:3px solid #4f46e5;padding-bottom:14px;margin-bottom:20px;">
        <h1 style="margin:0 0 4px;font-size:22px;color:#111;">${c.name}</h1>
        <p style="margin:0;color:#555;font-size:13px;">Master Cashflow Report</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:8px 12px;background:#f5f5f5;border-radius:6px;margin-right:8px;">
            <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Generated</div>
            <div style="font-weight:700;margin-top:2px;">${todayDateStr()}</div>
          </td>
          <td style="padding:8px 12px;background:#f5f5f5;">
            <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Members</div>
            <div style="font-weight:700;margin-top:2px;">${members.length}</div>
          </td>
          <td style="padding:8px 12px;background:#f5f5f5;">
            <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Pool per Draw</div>
            <div style="font-weight:700;margin-top:2px;">${fmtMoney(computePool(c))}</div>
          </td>
          <td style="padding:8px 12px;background:#f5f5f5;">
            <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Collection Rate</div>
            <div style="font-weight:700;margin-top:2px;color:${collectionRate >= 80 ? '#059669' : '#dc2626'};">${collectionRate}%</div>
          </td>
        </tr>
      </table>

      <h2 style="font-size:14px;color:#333;margin:0 0 10px;border-bottom:1px solid #ddd;padding-bottom:6px;">Month-by-Month Cashflow</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f0f0f0;">
            <th style="text-align:left;padding:9px 10px;border:1px solid #ddd;font-size:12px;">Month</th>
            <th style="text-align:left;padding:9px 10px;border:1px solid #ddd;font-size:12px;">Inflow (Collected)</th>
            <th style="text-align:left;padding:9px 10px;border:1px solid #ddd;font-size:12px;">Outflow (Payout)</th>
            <th style="text-align:left;padding:9px 10px;border:1px solid #ddd;font-size:12px;">Net</th>
            <th style="text-align:left;padding:9px 10px;border:1px solid #ddd;font-size:12px;">Cash on Hand</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:#e8e8e8;font-weight:700;">
            <td style="padding:9px 10px;border:1px solid #ddd;">Total</td>
            <td style="padding:9px 10px;border:1px solid #ddd;color:#059669;">${fmtMoney(totalInflow)}</td>
            <td style="padding:9px 10px;border:1px solid #ddd;color:#dc2626;">${fmtMoney(totalOutflow)}</td>
            <td style="padding:9px 10px;border:1px solid #ddd;">${fmtMoney(totalInflow - totalOutflow)}</td>
            <td style="padding:9px 10px;border:1px solid #ddd;color:${cumCash >= 0 ? '#059669' : '#dc2626'};">${fmtMoney(cumCash)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  renderPdf(html, `${c.name.replace(/\s+/g, '_')}_cashflow_${todayDateStr()}.pdf`);
});

function renderPdf(html, filename) {
  const area = document.getElementById('pdf-render-area');
  // Temporarily make it visible so html2canvas can capture it
  area.style.position = 'fixed';
  area.style.left = '0';
  area.style.top = '0';
  area.style.zIndex = '-999';
  area.style.opacity = '0';
  area.style.pointerEvents = 'none';
  area.innerHTML = html;

  const opt = {
    margin: [8, 8, 8, 8],
    filename: filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };

  html2pdf().set(opt).from(area).save().then(() => {
    // Reset after export
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    area.style.opacity = '1';
    area.innerHTML = '';
  }).catch(err => {
    console.error('PDF error:', err);
    alert('PDF export failed: ' + err.message);
    area.style.left = '-9999px';
  });
}