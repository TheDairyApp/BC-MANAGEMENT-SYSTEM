// ============================================================
// State (initialized in DOMContentLoaded)
// ============================================================
let activeCommitteeId = null;
let currentView = 'committees';
let views = {};
let navs = {};

function activeCommittee() {
  if (!DB || !DB.cache || !DB.cache.committees) return null;
  return DB.cache.committees.find(c => c.id === activeCommitteeId) || null;
}

function switchView(name) {
  if (!views[name]) return;
  if (name !== 'committees' && !activeCommittee()) {
    alert('Select or create a committee first.');
    name = 'committees';
  }
  currentView = name;
  Object.values(views).forEach(v => v.classList.add('hidden'));
  Object.values(navs).forEach(n => n.classList.remove('active'));
  views[name].classList.remove('hidden');
  navs[name].classList.add('active');
  renderCurrentView();
  window.scrollTo(0, 0);
}

function renderCurrentView() {
  if (!views || Object.keys(views).length === 0) return;
  if (currentView === 'committees' && typeof renderCommitteesView === 'function') renderCommitteesView();
  if (currentView === 'dashboard' && typeof renderDashboardView === 'function') renderDashboardView();
  if (currentView === 'matrix' && typeof renderMatrixView === 'function') renderMatrixView();
  if (currentView === 'qurandazi' && typeof renderQurandaziView === 'function') renderQurandaziView();
  if (currentView === 'reports' && typeof renderReportsView === 'function') renderReportsView();
}

// ============================================================
// Init / Auth
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize views and navs now that DOM is ready
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

  // Check auth first
  const isLoggedIn = await DB.init();
  if (isLoggedIn) {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    window.dispatchEvent(new Event('db_updated'));
  }

  // Attach nav listeners only after auth check
  if (navs.committees) navs.committees.addEventListener('click', e => { e.preventDefault(); switchView('committees'); });
  if (navs.dashboard) navs.dashboard.addEventListener('click', e => { e.preventDefault(); switchView('dashboard'); });
  if (navs.matrix) navs.matrix.addEventListener('click', e => { e.preventDefault(); switchView('matrix'); });
  if (navs.qurandazi) navs.qurandazi.addEventListener('click', e => { e.preventDefault(); switchView('qurandazi'); });
  if (navs.reports) navs.reports.addEventListener('click', e => { e.preventDefault(); switchView('reports'); });
});

document.getElementById('login-btn').addEventListener('click', async () => {
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: document.getElementById('email').value, password: document.getElementById('password').value
  });
  if (error) alert(error.message); else if (await DB.init()) location.reload();
});
document.getElementById('signup-btn').addEventListener('click', async () => {
  const { error } = await supabaseClient.auth.signUp({
    email: document.getElementById('email').value, password: document.getElementById('password').value
  });
  if (error) alert(error.message); else { alert('Account created. Please log in.'); }
});
document.getElementById('logout-btn').addEventListener('click', async (e) => {
  e.preventDefault();
  await supabaseClient.auth.signOut();
  DB.user = null;
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
});

// ============================================================
// Active committee selector
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const committeeSelectEl = document.getElementById('active-committee-select');
  if (committeeSelectEl) {
    committeeSelectEl.addEventListener('change', () => {
      activeCommitteeId = committeeSelectEl.value;
      renderCurrentView();
    });
  }
});

window.addEventListener('db_updated', () => {
  const committeeSelectEl = document.getElementById('active-committee-select');
  if (committeeSelectEl && DB && DB.cache && DB.cache.committees) {
    committeeSelectEl.innerHTML = DB.cache.committees.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    if (!activeCommitteeId && DB.cache.committees[0]) activeCommitteeId = DB.cache.committees[0].id;
    if (activeCommitteeId) committeeSelectEl.value = activeCommitteeId;
    renderCurrentView();
  }
});

// ============================================================
// COMMITTEES VIEW
// ============================================================
function renderCommitteesView() {
  const grid = document.getElementById('committees-grid');
  grid.innerHTML = '';
  if (DB.cache.committees.length === 0) {
    grid.innerHTML = '<p class="muted">No committees yet. Click "+ New Committee" to create your first one.</p>';
    return;
  }
  DB.cache.committees.forEach(c => {
    const members = DB.getMembersForCommittee(c.id);
    const pool = computePool(c);
    const card = document.createElement('div');
    card.className = 'committee-card';
    card.innerHTML = `
      <h3>${c.name}</h3>
      <p>${members.length} members · ${c.total_months} months · ${fmtMoney(c.monthly_installment)}/month</p>
      <p>Start: ${c.start_date} · Pool per draw: ${fmtMoney(pool)}</p>
      <div class="card-actions">
        <button class="primary small" data-action="open">Open</button>
        <button class="danger-btn small" data-action="delete">Delete</button>
      </div>
    `;
    card.querySelector('[data-action="open"]').addEventListener('click', () => {
      activeCommitteeId = c.id; committeeSelectEl.value = c.id; switchView('dashboard');
    });
    card.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${c.name}" permanently? This removes all members, schedule and payments.`)) {
        if (activeCommitteeId === c.id) activeCommitteeId = null;
        await DB.deleteCommittee(c.id);
      }
    });
    grid.appendChild(card);
  });
}

document.getElementById('add-committee-btn').addEventListener('click', openCommitteeModal);
document.getElementById('qa-new-committee').addEventListener('click', openCommitteeModal);

function openCommitteeModal() {
  document.getElementById('cm-name').value = '';
  document.getElementById('cm-start').value = todayDateStr();
  document.getElementById('cm-months').value = 10;
  document.getElementById('cm-installment').value = '';
  document.getElementById('cm-pool-override').value = '';
  const list = document.getElementById('cm-members-list');
  list.innerHTML = '';
  addMemberRow(); addMemberRow();
  document.getElementById('committee-modal').classList.remove('hidden');
}
function addMemberRow(name = '', phone = '') {
  const list = document.getElementById('cm-members-list');
  const row = document.createElement('div');
  row.className = 'member-row';
  row.innerHTML = `
    <input type="text" class="mr-name" placeholder="Member name" value="${name}">
    <input type="text" class="mr-phone" placeholder="Phone (e.g. 923001234567)" value="${phone}">
    <button type="button" class="secondary mr-remove">✕</button>
  `;
  row.querySelector('.mr-remove').addEventListener('click', () => row.remove());
  list.appendChild(row);
}
document.getElementById('cm-add-member-row-btn').addEventListener('click', () => addMemberRow());
document.getElementById('cm-cancel-btn').addEventListener('click', () => document.getElementById('committee-modal').classList.add('hidden'));

document.getElementById('cm-save-btn').addEventListener('click', async () => {
  const name = document.getElementById('cm-name').value.trim();
  const start = document.getElementById('cm-start').value;
  const months = Number(document.getElementById('cm-months').value);
  const installment = Number(document.getElementById('cm-installment').value);
  const poolOverride = document.getElementById('cm-pool-override').value;
  if (!name || !start || !months || !installment) { alert('Please fill in name, start date, months and installment.'); return; }

  const memberRows = Array.from(document.querySelectorAll('#cm-members-list .member-row')).map(row => ({
    name: row.querySelector('.mr-name').value, phone: row.querySelector('.mr-phone').value
  })).filter(m => m.name.trim());
  if (memberRows.length === 0) { alert('Add at least one member.'); return; }

  document.getElementById('committee-modal').classList.add('hidden');
  const committee = await DB.addCommittee({
    name, start_date: start, total_months: months, monthly_installment: installment,
    pool_override: poolOverride === '' ? null : Number(poolOverride)
  }, memberRows);
  if (committee) { activeCommitteeId = committee.id; switchView('dashboard'); }
});

// ============================================================
// DASHBOARD VIEW
// ============================================================
function renderDashboardView() {
  const c = activeCommittee();
  if (!c) return;
  const members = DB.getMembersForCommittee(c.id);
  const schedule = DB.getScheduleForCommittee(c.id);
  const scheduleKeys = buildScheduleKeys(c.start_date, c.total_months);

  document.getElementById('dash-committee-name').textContent = c.name;
  document.getElementById('dash-committee-sub').textContent =
    `${members.length} members · ${c.total_months} months · ${fmtMoney(c.monthly_installment)}/month · Pool ${fmtMoney(computePool(c))}`;

  // active month = latest schedule month that is <= today, else first month
  const today = todayMonthKey();
  let activeMonthKey = scheduleKeys[0];
  scheduleKeys.forEach(mk => { if (mk <= today) activeMonthKey = mk; });

  const expected = members.length * Number(c.monthly_installment);
  const collected = DB.cache.transactions.filter(t => t.committee_id === c.id && t.month_key === activeMonthKey && t.type === 'inflow_installment').reduce((s, t) => s + Number(t.amount), 0);
  const disbursed = DB.cache.transactions.filter(t => t.committee_id === c.id && t.type === 'outflow_payout').reduce((s, t) => s + Number(t.amount), 0);
  const deficit = expected - collected;

  document.getElementById('stat-expected').textContent = fmtMoney(expected) + ` (${monthLabel(activeMonthKey)})`;
  document.getElementById('stat-collected').textContent = fmtMoney(collected);
  document.getElementById('stat-disbursed').textContent = fmtMoney(disbursed);
  const deficitEl = document.getElementById('stat-deficit');
  deficitEl.textContent = fmtMoney(deficit);
  deficitEl.className = deficit > 0 ? 'negative' : 'positive';

  // Next in line
  const nextRow = schedule.find(s => s.month_key === activeMonthKey) || schedule.find(s => s.status === 'pending');
  const nextBody = document.getElementById('next-in-line-body');
  if (!nextRow) {
    nextBody.innerHTML = '<p class="muted">No schedule found.</p>';
  } else if (!nextRow.member_id) {
    nextBody.innerHTML = `<p class="muted">Month: <strong>${monthLabel(nextRow.month_key)}</strong> — winner not yet drawn.</p>
      <button class="primary small" onclick="switchView('qurandazi')" style="margin-top:8px;">Run Qurandazi</button>`;
  } else {
    const winner = members.find(m => m.id === nextRow.member_id);
    nextBody.innerHTML = `
      <div class="winner-name">${winner ? winner.name : 'Unknown'}</div>
      <p class="muted">Month: ${monthLabel(nextRow.month_key)} · Payout: ${fmtMoney(nextRow.payout_amount)} ·
      <span class="badge ${nextRow.status === 'paid' ? 'success' : 'warning'}">${nextRow.status}</span></p>`;
  }

  // Lagging members this month
  const laggingWrap = document.getElementById('lagging-list');
  laggingWrap.innerHTML = '';
  const admin = JSON.parse(localStorage.getItem('bcms_admin_details_' + c.id) || '""');
  const lagging = members.filter(m => {
    const cell = computeCellStatus(c, m.id, activeMonthKey);
    return cell.status === 'unpaid' || cell.status === 'partial';
  });
  if (lagging.length === 0) {
    laggingWrap.innerHTML = '<p class="muted">Everyone is paid up for this month. 🎉</p>';
  } else {
    lagging.forEach(m => {
      const cell = computeCellStatus(c, m.id, activeMonthKey);
      const due = cell.due - cell.paidSum;
      const row = document.createElement('div');
      row.className = 'row-between';
      row.style.cssText = 'padding:10px 0; border-bottom:1px solid var(--border-color);';
      row.innerHTML = `
        <span>${m.name} — <span class="badge ${cell.status === 'partial' ? 'warning' : ''}">${cell.status}</span> · owes ${fmtMoney(due)}</span>
        <button class="secondary small">📱 Remind on WhatsApp</button>
      `;
      row.querySelector('button').addEventListener('click', () => sendWhatsAppReminder(c, m, activeMonthKey, due, admin));
      laggingWrap.appendChild(row);
    });
  }
}

function sendWhatsAppReminder(committee, member, monthKey, amountDue, adminDetails) {
  if (!member.phone) { alert('This member has no phone number on file.'); return; }
  const phone = member.phone.replace(/[^0-9]/g, '');
  let msg = `Assalam-o-Alaikum ${member.name}, your ${committee.name} BC installment of ${fmtMoney(amountDue)} for ${monthLabel(monthKey)} is still pending.`;
  if (adminDetails) msg += `\nPlease pay to: ${adminDetails}`;
  msg += `\nJazakAllah Khair.`;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

document.getElementById('qa-record-payment').addEventListener('click', () => openPayModal(null, null));
document.getElementById('qa-run-qurandazi').addEventListener('click', () => switchView('qurandazi'));

// ============================================================
// COLLECTION MATRIX VIEW
// ============================================================
function renderMatrixView() {
  const c = activeCommittee();
  if (!c) return;
  const members = DB.getMembersForCommittee(c.id);
  const scheduleKeys = buildScheduleKeys(c.start_date, c.total_months);
  const table = document.getElementById('matrix-table');

  let thead = '<thead><tr><th class="member-col">Member</th>' + scheduleKeys.map((mk, i) => `<th>M${i + 1}<br><span style="font-weight:400;">${monthLabel(mk)}</span></th>`).join('') + '</tr></thead>';
  let tbody = '<tbody>';
  members.forEach(m => {
    tbody += `<tr><td class="member-col">${m.name}</td>`;
    scheduleKeys.forEach(mk => {
      const cell = computeCellStatus(c, m.id, mk);
      const label = cell.status === 'full' ? '✓' : cell.status === 'partial' ? fmtMoney(cell.paidSum).replace('Rs ', '') : cell.status === 'skipped' ? '—' : '✕';
      tbody += `<td><div class="matrix-cell ${cell.status}" data-member="${m.id}" data-month="${mk}" title="${m.name} — ${monthLabel(mk)}: ${cell.status}">${label}</div></td>`;
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';
  table.innerHTML = thead + tbody;

  table.querySelectorAll('.matrix-cell').forEach(cell => {
    cell.addEventListener('click', () => openPayModal(cell.dataset.member, cell.dataset.month));
  });
}

// ============================================================
// PAYMENT MODAL (record / edit a member+month, supports split payments)
// ============================================================
function openPayModal(memberId, monthKey) {
  const c = activeCommittee();
  if (!c) return;
  const members = DB.getMembersForCommittee(c.id);
  const scheduleKeys = buildScheduleKeys(c.start_date, c.total_months);

  const memberSelect = document.getElementById('pay-member-select');
  memberSelect.innerHTML = members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  if (memberId) memberSelect.value = memberId;

  const monthSelect = document.getElementById('pay-month-select');
  monthSelect.innerHTML = scheduleKeys.map(mk => `<option value="${mk}">${monthLabel(mk)}</option>`).join('');
  if (monthKey) monthSelect.value = monthKey;

  document.getElementById('pay-modal-title').textContent = 'Record Payment';
  loadPayModalData();
  memberSelect.addEventListener('change', loadPayModalData);
  monthSelect.addEventListener('change', loadPayModalData);

  document.getElementById('pay-modal').classList.remove('hidden');
}

function loadPayModalData() {
  const c = activeCommittee();
  const memberId = document.getElementById('pay-member-select').value;
  const monthKey = document.getElementById('pay-month-select').value;
  const member = DB.cache.members.find(m => m.id === memberId);
  document.getElementById('pay-modal-title').textContent = member ? `${member.name} — ${monthLabel(monthKey)}` : 'Record Payment';

  const txs = DB.cache.transactions.filter(t => t.committee_id === c.id && t.member_id === memberId && t.month_key === monthKey && t.type === 'inflow_installment');
  const skipped = txs.some(t => (t.notes || '').toUpperCase().includes('SKIPPED'));
  const existingNotes = txs.length ? (txs[0].notes || '').replace(/^SKIPPED\s*\|?\s*/i, '') : '';

  document.getElementById('pay-notes').value = existingNotes;
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
    <input type="number" class="pl-amount" placeholder="Amount (Rs)" value="${amount}">
    <input type="date" class="pl-date" value="${date || todayDateStr()}">
    <button type="button" class="secondary pl-remove">✕</button>
  `;
  row.querySelector('.pl-remove').addEventListener('click', () => row.remove());
  wrap.appendChild(row);
}
document.getElementById('pay-add-line-btn').addEventListener('click', () => addPayLine());
document.getElementById('pay-cancel-btn').addEventListener('click', () => document.getElementById('pay-modal').classList.add('hidden'));

document.getElementById('pay-save-btn').addEventListener('click', async () => {
  const c = activeCommittee();
  const memberId = document.getElementById('pay-member-select').value;
  const monthKey = document.getElementById('pay-month-select').value;
  const notes = document.getElementById('pay-notes').value;
  const skipped = document.getElementById('pay-skipped').checked;
  const lines = Array.from(document.querySelectorAll('#pay-lines .payment-line')).map(row => ({
    amount: row.querySelector('.pl-amount').value, date: row.querySelector('.pl-date').value
  }));
  document.getElementById('pay-modal').classList.add('hidden');
  await DB.setPaymentLines(c.id, memberId, monthKey, lines, notes, skipped);
});

// ============================================================
// QURANDAZI (LUCKY DRAW) STUDIO
// ============================================================
function renderQurandaziView() {
  const c = activeCommittee();
  if (!c) return;
  const schedule = DB.getScheduleForCommittee(c.id);
  const members = DB.getMembersForCommittee(c.id);
  const drawnMemberIds = new Set(schedule.filter(s => s.member_id).map(s => s.member_id));
  const eligibleMembers = members.filter(m => !drawnMemberIds.has(m.id));
  const undrawnMonths = schedule.filter(s => !s.member_id);

  const monthSelect = document.getElementById('qd-month-select');
  monthSelect.innerHTML = undrawnMonths.map(s => `<option value="${s.id}">${monthLabel(s.month_key)}</option>`).join('');
  document.getElementById('qd-run-draw-btn').disabled = undrawnMonths.length === 0 || eligibleMembers.length === 0;

  const manualSelect = document.getElementById('qd-manual-member-select');
  manualSelect.innerHTML = eligibleMembers.map(m => `<option value="${m.id}">${m.name}</option>`).join('');

  document.getElementById('qd-draw-box').classList.add('hidden');
  document.getElementById('qd-winner').classList.add('hidden');
  document.getElementById('qd-manual-wrap').classList.add('hidden');

  // Schedule table
  const tbody = document.getElementById('qd-schedule-body');
  tbody.innerHTML = '';
  schedule.forEach(s => {
    const member = members.find(m => m.id === s.member_id);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${monthLabel(s.month_key)}</td>
      <td>${member ? member.name : '<span class="muted">Not drawn</span>'}</td>
      <td>${s.draw_type ? `<span class="badge">${s.draw_type}</span>` : '—'}</td>
      <td>${s.payout_amount != null ? fmtMoney(s.payout_amount) : '—'}</td>
      <td><span class="badge ${s.status === 'paid' ? 'success' : 'warning'}">${s.status}</span></td>
      <td>${(s.member_id && s.status === 'pending') ? '<button class="primary small" data-action="mark-paid">Mark Paid</button>' : ''}</td>
    `;
    if (s.member_id && s.status === 'pending') {
      tr.querySelector('[data-action="mark-paid"]').addEventListener('click', () => openPayoutModal(s));
    }
    tbody.appendChild(tr);
  });
}

document.getElementById('qd-manual-toggle-btn').addEventListener('click', () => {
  document.getElementById('qd-manual-wrap').classList.toggle('hidden');
});

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
  const drawnMemberIds = new Set(schedule.filter(s => s.member_id).map(s => s.member_id));
  const eligibleMembers = members.filter(m => !drawnMemberIds.has(m.id));
  if (eligibleMembers.length === 0) { alert('No eligible members left to draw.'); return; }

  const box = document.getElementById('qd-draw-box');
  const slipsWrap = document.getElementById('qd-slips');
  const winnerWrap = document.getElementById('qd-winner');
  box.classList.remove('hidden');
  winnerWrap.classList.add('hidden');
  slipsWrap.innerHTML = eligibleMembers.map(m => `<div class="slip" data-member="${m.id}">${m.name}</div>`).join('');

  document.getElementById('qd-run-draw-btn').disabled = true;
  const winner = eligibleMembers[Math.floor(Math.random() * eligibleMembers.length)];

  setTimeout(async () => {
    slipsWrap.querySelectorAll('.slip').forEach(slip => {
      slip.classList.add('settled');
      if (slip.dataset.member === winner.id) slip.classList.remove('settled');
    });
    winnerWrap.textContent = `🎉 ${winner.name} wins this round!`;
    winnerWrap.classList.remove('hidden');
    await DB.assignDraw(scheduleId, winner.id, 'qurandazi');
    document.getElementById('qd-run-draw-btn').disabled = false;
    renderQurandaziView();
  }, 1800);
});

function openPayoutModal(scheduleRow) {
  const member = DB.cache.members.find(m => m.id === scheduleRow.member_id);
  document.getElementById('payout-modal-info').textContent =
    `${member ? member.name : 'Member'} — ${monthLabel(scheduleRow.month_key)}`;
  document.getElementById('payout-amount-input').value = scheduleRow.payout_amount || 0;
  document.getElementById('payout-date-input').value = todayDateStr();
  document.getElementById('payout-modal').dataset.scheduleId = scheduleRow.id;
  document.getElementById('payout-modal').classList.remove('hidden');
}
document.getElementById('payout-cancel-btn').addEventListener('click', () => document.getElementById('payout-modal').classList.add('hidden'));
document.getElementById('payout-confirm-btn').addEventListener('click', async () => {
  const scheduleId = document.getElementById('payout-modal').dataset.scheduleId;
  const amount = Number(document.getElementById('payout-amount-input').value);
  const dateStr = document.getElementById('payout-date-input').value;
  document.getElementById('payout-modal').classList.add('hidden');
  await DB.markPayoutPaid(scheduleId, amount, dateStr);
  renderQurandaziView();
});

// ============================================================
// REPORTS VIEW + PDF EXPORT
// ============================================================
function renderReportsView() {
  const c = activeCommittee();
  if (!c) return;
  const members = DB.getMembersForCommittee(c.id);
  document.getElementById('report-member-select').innerHTML = members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  document.getElementById('admin-payment-details').value = localStorage.getItem('bcms_admin_details_' + c.id) || '';
}

document.getElementById('save-admin-details-btn').addEventListener('click', () => {
  const c = activeCommittee();
  localStorage.setItem('bcms_admin_details_' + c.id, document.getElementById('admin-payment-details').value);
  alert('Saved.');
});

document.getElementById('export-member-pdf-btn').addEventListener('click', () => {
  const c = activeCommittee();
  const memberId = document.getElementById('report-member-select').value;
  const member = DB.cache.members.find(m => m.id === memberId);
  if (!member) return;
  const ledger = computeMemberLedger(c, member);

  const rowsHtml = ledger.rows.map(r => `
    <tr>
      <td>${monthLabel(r.monthKey)}</td>
      <td>${fmtMoney(r.due)}</td>
      <td>${fmtMoney(r.paid)}</td>
      <td style="text-transform:capitalize;">${r.status}${r.isPayoutMonth ? ' (Payout Month)' : ''}</td>
      <td style="color:${r.balance < 0 ? '#b91c1c' : '#047857'};">${fmtMoney(r.balance)}</td>
    </tr>`).join('');

  const html = `
    <div class="pdf-doc">
      <h1>${c.name} — Member Ledger</h1>
      <p class="pdf-meta">Member: <strong>${member.name}</strong> ${member.phone ? '(' + member.phone + ')' : ''}<br>
      Generated: ${todayDateStr()} · Installment: ${fmtMoney(c.monthly_installment)}/month · Total months: ${c.total_months}</p>
      <h2>Payout</h2>
      <p>${ledger.payoutRow && ledger.payoutRow.member_id ? `Scheduled: ${monthLabel(ledger.payoutRow.month_key)} · Amount: ${fmtMoney(ledger.payoutRow.payout_amount)} · Status: ${ledger.payoutRow.status}` : 'Not yet drawn.'}</p>
      <h2>Monthly Ledger</h2>
      <table>
        <thead><tr><th>Month</th><th>Due</th><th>Paid</th><th>Status</th><th>Balance</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
  renderPdf(html, `${c.name.replace(/\s+/g, '_')}_${member.name.replace(/\s+/g, '_')}_ledger.pdf`);
});

document.getElementById('export-master-pdf-btn').addEventListener('click', () => {
  const c = activeCommittee();
  const members = DB.getMembersForCommittee(c.id);
  const scheduleKeys = buildScheduleKeys(c.start_date, c.total_months);

  let cumulativeCash = 0;
  const rowsHtml = scheduleKeys.map(mk => {
    const inflow = DB.cache.transactions.filter(t => t.committee_id === c.id && t.month_key === mk && t.type === 'inflow_installment').reduce((s, t) => s + Number(t.amount), 0);
    const outflow = DB.cache.transactions.filter(t => t.committee_id === c.id && t.month_key === mk && t.type === 'outflow_payout').reduce((s, t) => s + Number(t.amount), 0);
    cumulativeCash += inflow - outflow;
    return `<tr><td>${monthLabel(mk)}</td><td>${fmtMoney(inflow)}</td><td>${fmtMoney(outflow)}</td><td>${fmtMoney(inflow - outflow)}</td><td>${fmtMoney(cumulativeCash)}</td></tr>`;
  }).join('');

  const html = `
    <div class="pdf-doc">
      <h1>${c.name} — Master Cashflow Report</h1>
      <p class="pdf-meta">Generated: ${todayDateStr()} · ${members.length} members · Pool per draw: ${fmtMoney(computePool(c))}</p>
      <h2>Month-by-Month Cashflow</h2>
      <table>
        <thead><tr><th>Month</th><th>Inflow (Collected)</th><th>Outflow (Payout)</th><th>Net</th><th>Cash on Hand (Cumulative)</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
  renderPdf(html, `${c.name.replace(/\s+/g, '_')}_master_cashflow.pdf`);
});

function renderPdf(html, filename) {
  const area = document.getElementById('pdf-render-area');
  area.innerHTML = html;
  html2pdf().from(area).set({ filename, margin: 10, html2canvas: { scale: 2 } }).save();
}
