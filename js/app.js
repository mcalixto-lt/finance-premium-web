(() => {
  'use strict';

  const config = window.FINANCE_APP_CONFIG || {};
  const STORAGE_KEY = config.storageKey || 'finance-premium-web-state-v1';
  const SETTINGS_KEY = config.settingsKey || 'finance-premium-web-settings-v1';
  const BACKUP_VERSION = 2;
  const DRIVE_FILE_NAME = config.backupFileName || 'finance-premium-backup.json';
  const DRIVE_SCOPE = config.googleDriveScope || 'https://www.googleapis.com/auth/drive.file';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const BRL = new Intl.NumberFormat(config.locale || 'pt-BR', { style: 'currency', currency: config.currency || 'BRL' });
  const fmtMonth = new Intl.DateTimeFormat(config.locale || 'pt-BR', { month: 'short' });
  const fmtMonthYear = new Intl.DateTimeFormat(config.locale || 'pt-BR', { month: 'short', year: 'numeric' });
  const formatMoney = value => BRL.format(Number(value) || 0).replace(/\s/g, ' ');
  const money = value => `<span class="money-value" data-money="${Number(value) || 0}">${formatMoney(value)}</span>`;
  const uid = prefix => `${prefix || 'id'}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const svg = (id, className = '') => `<svg${className ? ` class="${className}"` : ''}><use href="#${id}"/></svg>`;
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const sum = (items, selector = value => value) => items.reduce((total, item) => total + (Number(selector(item)) || 0), 0);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const defaultState = window.FINANCE_MOCK_DATA || {};
  const defaultAvatar = config.defaultProfile?.avatar || 'assets/images/avatar-bruno.svg';

  let settings = loadSettings();
  let state = migrateState(loadState());
  let currentPage = 'dashboard';
  let currentModal = null;
  let editingId = null;
  let driveTokenClient = null;
  let driveAccessToken = '';
  let clockTimer = null;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function cloneDefault() { return clone(defaultState); }

  function defaultSettings() {
    return {
      theme: 'dark',
      hideValues: false,
      notifications: true,
      localStorage: true,
      name: config.defaultProfile?.name || 'Mauro Silva',
      email: config.defaultProfile?.email || 'mauro@finance.local',
      avatar: defaultAvatar,
      googleClientId: config.googleDriveClientId || '',
      driveFileId: '',
      lastLocalSave: ''
    };
  }

  function loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { saved = {}; }
    const merged = { ...defaultSettings(), ...saved };
    if (!merged.name || /^Bruno Silva$/i.test(merged.name)) merged.name = 'Mauro Silva';
    if (!merged.email || /^bruno\.silva@/i.test(merged.email)) merged.email = 'mauro@finance.local';
    if (!merged.avatar) merged.avatar = defaultAvatar;
    return merged;
  }

  function loadState() {
    if (settings.localStorage === false) return cloneDefault();
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || cloneDefault(); }
    catch { return cloneDefault(); }
  }

  function migrateState(raw) {
    const base = cloneDefault();
    const source = raw && typeof raw === 'object' ? raw : {};
    const merged = {
      ...base,
      ...source,
      meta: { ...(base.meta || {}), ...(source.meta || {}) },
      summary: Array.isArray(source.summary) ? source.summary : (base.summary || []),
      transactions: Array.isArray(source.transactions) ? source.transactions : (base.transactions || []),
      installments: Array.isArray(source.installments) ? source.installments : (base.installments || []),
      thirdParties: Array.isArray(source.thirdParties) ? source.thirdParties : (base.thirdParties || []),
      cards: Array.isArray(source.cards) ? source.cards : (base.cards || []),
      invoices: Array.isArray(source.invoices) ? source.invoices : (base.invoices || []),
      budgets: Array.isArray(source.budgets) ? source.budgets : (base.budgets || []),
      goals: Array.isArray(source.goals) ? source.goals : (base.goals || []),
      categories: Array.isArray(source.categories) ? source.categories : (base.categories || [])
    };

    merged.meta.openingBalance = Number(merged.meta.openingBalance ?? 18000);
    merged.meta.openingCash = Number(merged.meta.openingCash ?? 1320);
    merged.cards = merged.cards.map(card => ({
      ...card,
      id: card.id || uid('card'),
      total: Number(card.total) || 0,
      openingUsed: Number.isFinite(Number(card.openingUsed)) ? Number(card.openingUsed) : Math.max(0, (Number(card.total) || 0) - (Number(card.available) || 0)),
      holder: card.holder || settings.name.toUpperCase(),
      gradient: card.gradient || 'linear-gradient(145deg,#1c2430,#080b10 72%)'
    }));
    merged.transactions = merged.transactions.map(transaction => ({
      ...transaction,
      id: transaction.id || uid('tx'),
      value: Number(transaction.value) || 0,
      cardId: transaction.cardId || '',
      receipt: Boolean(transaction.receipt)
    }));
    merged.thirdParties = merged.thirdParties.map(record => ({
      ...record,
      id: record.id || uid('third'),
      value: Number(record.value) || 0,
      cardId: record.cardId || '',
      installmentsCurrent: Math.max(1, Number(record.installmentsCurrent) || 1),
      installmentsTotal: Math.max(1, Number(record.installmentsTotal) || 1),
      purchaseDate: record.purchaseDate || new Date().toISOString().slice(0, 10),
      category: record.category || 'Terceiros'
    }));
    merged.invoices = merged.invoices.map(invoice => ({ ...invoice, id: invoice.id || uid('invoice'), value: Number(invoice.value) || 0, cardId: invoice.cardId || findCardIdFromText(invoice.card, merged.cards) }));
    return merged;
  }

  function findCardIdFromText(text, cards = state?.cards || []) {
    const source = String(text || '');
    return cards.find(card => source.includes(card.last4) || source.includes(card.name))?.id || '';
  }

  function persistSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Navegador sem armazenamento disponível. */ }
  }

  function persist() {
    if (settings.localStorage === false) return;
    try {
      settings.lastLocalSave = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      renderLastSave();
    } catch { toast('Não foi possível salvar os dados localmente.', true); }
  }

  function formatDate(value) {
    if (!value) return '—';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
  }

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
  function monthStart(date) { return new Date(date.getFullYear(), date.getMonth(), 1, 12); }
  function addMonths(date, amount) { return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12); }

  function referenceDate() {
    const dates = [
      ...state.transactions.map(item => parseDate(item.date)),
      ...state.thirdParties.map(item => parseDate(item.purchaseDate))
    ].filter(Boolean);
    if (!dates.length) return new Date();
    return new Date(Math.max(...dates.map(date => date.getTime())));
  }

  function getMonths(count) {
    const end = monthStart(referenceDate());
    return Array.from({ length: count }, (_, index) => addMonths(end, index - count + 1));
  }

  function categoryColor(category) {
    return ({
      'Alimentação':'#ef536d','Transporte':'#3e8ae0','Compras':'#8a50d0','Recebimento':'#2dd4a8',
      'Saúde':'#2bb99c','Assinatura':'#eeb64d','Moradia':'#2dd4a8','Terceiros':'#f0a94b','Outros':'#657180'
    })[category] || '#657180';
  }

  function transactionTotals() {
    const entries = sum(state.transactions.filter(item => item.type === 'Entrada'), item => item.value);
    const expenses = sum(state.transactions.filter(item => item.type === 'Saída'), item => item.value);
    return { entries, expenses, net: entries - expenses };
  }

  function thirdTotals() {
    const receivable = sum(state.thirdParties.filter(item => item.status === 'A Receber'), item => item.value);
    const payable = sum(state.thirdParties.filter(item => item.status === 'A Pagar'), item => item.value);
    return { receivable, payable, net: receivable - payable };
  }

  function cardLinkedSpend(cardId) {
    if (!cardId) return 0;
    const transactionSpend = sum(state.transactions.filter(item => item.cardId === cardId && item.type === 'Saída' && item.payment === 'Crédito'), item => item.value);
    const thirdSpend = sum(state.thirdParties.filter(item => item.cardId === cardId), item => item.value);
    return transactionSpend + thirdSpend;
  }

  function cardStats(card) {
    const linked = cardLinkedSpend(card.id);
    const used = Math.max(0, Number(card.openingUsed || 0) + linked);
    const available = Math.max(0, Number(card.total || 0) - used);
    return { used, available, linked, percent: card.total ? clamp(used / card.total * 100, 0, 100) : 0 };
  }

  function financialSummary() {
    const tx = transactionTotals();
    const third = thirdTotals();
    const cashEntries = sum(state.transactions.filter(item => item.type === 'Entrada' && item.payment === 'Dinheiro'), item => item.value);
    const cashExpenses = sum(state.transactions.filter(item => item.type === 'Saída' && item.payment === 'Dinheiro'), item => item.value);
    return {
      balance: Number(state.meta.openingBalance || 0) + tx.net + third.net,
      pix: sum(state.transactions.filter(item => item.payment === 'Pix'), item => Math.abs(item.value)),
      cash: Number(state.meta.openingCash || 0) + cashEntries - cashExpenses,
      debit: sum(state.transactions.filter(item => item.type === 'Saída' && item.payment === 'Débito'), item => item.value),
      credit: sum(state.transactions.filter(item => item.type === 'Saída' && item.payment === 'Crédito'), item => item.value) + sum(state.thirdParties.filter(item => item.cardId), item => item.value),
      receivable: third.receivable,
      payable: third.payable,
      entries: tx.entries,
      expenses: tx.expenses
    };
  }

  function monthlyFlows(count) {
    const months = getMonths(count);
    const rows = months.map(date => ({ date, key: monthKey(date), receipts: 0, expenses: 0, net: 0 }));
    const map = new Map(rows.map(row => [row.key, row]));

    state.transactions.forEach(item => {
      const date = parseDate(item.date);
      const row = date && map.get(monthKey(date));
      if (!row) return;
      if (item.type === 'Entrada') row.receipts += item.value;
      else row.expenses += item.value;
    });

    state.thirdParties.forEach(item => {
      const date = parseDate(item.purchaseDate);
      const row = date && map.get(monthKey(date));
      if (!row) return;
      if (item.status === 'A Receber') {
        row.receipts += item.value;
        if (item.cardId) row.expenses += item.value;
      } else {
        row.expenses += item.value;
      }
    });

    rows.forEach(row => { row.net = row.receipts - row.expenses; });
    return rows;
  }

  function categoryBreakdown() {
    const totals = new Map();
    state.transactions.filter(item => item.type === 'Saída').forEach(item => totals.set(item.category || 'Outros', (totals.get(item.category || 'Outros') || 0) + item.value));
    state.thirdParties.forEach(item => totals.set(item.category || 'Terceiros', (totals.get(item.category || 'Terceiros') || 0) + item.value));
    const rows = [...totals.entries()].map(([name, value]) => ({ name, value, color: categoryColor(name) })).sort((a, b) => b.value - a.value);
    const total = sum(rows, row => row.value);
    return rows.map(row => ({ ...row, percent: total ? row.value / total * 100 : 0 }));
  }

  function trendText(current, previous, fallback = 'Atualizado agora') {
    if (!previous) return fallback;
    const percent = (current - previous) / Math.abs(previous) * 100;
    const arrow = percent >= 0 ? '↑' : '↓';
    return `${arrow} ${Math.abs(percent).toFixed(2).replace('.', ',')}%`;
  }

  function currentAndPreviousMonth() {
    const rows = monthlyFlows(2);
    return { previous: rows[0] || { receipts:0, expenses:0, net:0 }, current: rows[1] || { receipts:0, expenses:0, net:0 } };
  }

  function renderAll() {
    renderSummary();
    renderLineChart();
    renderCategoryList();
    renderDashboardCard();
    renderRecentPurchases();
    renderInstallments();
    renderThirdMini();
    renderDashboardInvoices();
    renderTransactions();
    renderCards();
    renderInvoices();
    renderPlanning();
    renderThirdParties();
    renderReports();
    applySettings();
  }

  function renderSummary() {
    const totals = financialSummary();
    const { current, previous } = currentAndPreviousMonth();
    const styles = {
      balance: { label:'Saldo Total', tone:'gold', accent:'#e2b35d', icon:'i-summary-wallet', value:totals.balance, trend:trendText(current.net, previous.net) },
      pix: { label:'Pix', tone:'teal', accent:'#28cbb8', icon:'i-summary-pix', value:totals.pix, trend:'Atualizado agora' },
      cash: { label:'Dinheiro', tone:'blue', accent:'#4699ff', icon:'i-summary-cash', value:totals.cash, trend:'Saldo em espécie' },
      debit: { label:'Débito', tone:'purple', accent:'#9a61f6', icon:'i-summary-debit', value:totals.debit, trend:trendText(current.expenses, previous.expenses) },
      credit: { label:'Crédito', tone:'pink', accent:'#e460a9', icon:'i-summary-credit', value:totals.credit, trend:'Compras e terceiros' },
      receivable: { label:'Valores a Receber', tone:'orange', accent:'#f0a94b', icon:'i-summary-receivable', value:totals.receivable, trend:'Atualizado agora' }
    };
    const order = ['balance','pix','cash','debit','credit','receivable'];
    $('#summaryGrid').innerHTML = order.map(key => {
      const item = styles[key];
      const down = item.trend.startsWith('↓');
      return `<article class="summary-card ${item.tone}" style="--accent:${item.accent}"><span class="summary-icon">${svg(item.icon, 'summary-svg')}</span><span class="label">${item.label}</span><strong data-money="${item.value}">${formatMoney(item.value)}</strong><span class="summary-trend ${down ? 'down' : ''}">${item.trend}</span></article>`;
    }).join('');
  }

  function makeSmoothPath(points) {
    if (!points.length) return '';
    let path = `M${points[0][0]},${points[0][1]}`;
    for (let index = 0; index < points.length - 1; index += 1) {
      const p0 = points[index - 1] || points[index];
      const p1 = points[index];
      const p2 = points[index + 1];
      const p3 = points[index + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      path += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
    }
    return path;
  }

  function renderLineChart() {
    const rows = monthlyFlows(6);
    const values = rows.flatMap(row => [row.receipts, row.expenses, Math.abs(row.net)]);
    const maxValue = Math.max(1000, ...values);
    const axisMax = Math.ceil(maxValue / 5000) * 5000 || 5000;
    const w = 520, h = 190, p = { l:42, r:12, t:14, b:25 };
    const x = index => p.l + index * (w - p.l - p.r) / Math.max(1, rows.length - 1);
    const y = value => p.t + (axisMax - Math.max(0, value)) * (h - p.t - p.b) / axisMax;
    const points = key => rows.map((row, index) => [x(index), y(key === 'net' ? Math.max(0, row.net) : row[key])]);
    const receiptsPath = makeSmoothPath(points('receipts'));
    const expensesPath = makeSmoothPath(points('expenses'));
    const netPath = makeSmoothPath(points('net'));
    const baseline = y(0);
    const area = path => `${path} L${x(rows.length - 1)},${baseline} L${x(0)},${baseline} Z`;
    const gridValues = Array.from({ length:5 }, (_, index) => axisMax * index / 4);
    const grid = gridValues.map(value => `<line class="chart-grid-line" x1="${p.l}" x2="${w-p.r}" y1="${y(value)}" y2="${y(value)}"/><text class="chart-axis-label" x="0" y="${y(value)+3}">${value ? `${Math.round(value/1000)}k` : '0'}</text>`).join('');
    const labels = rows.map((row, index) => `<text class="chart-axis-label" x="${x(index)}" y="${h-3}" text-anchor="middle">${fmtMonth.format(row.date).replace('.', '')}</text>`).join('');
    const dots = (key, color) => rows.map((row, index) => `<circle class="chart-point" cx="${x(index)}" cy="${y(key === 'net' ? Math.max(0,row.net) : row[key])}" r="2.5" fill="${color}" stroke="#0b1b29"/>`).join('');
    const current = rows[rows.length - 1] || { receipts:0, expenses:0, net:0, date:new Date() };
    const highlightX = x(rows.length - 1);
    const tooltipX = Math.max(300, Math.min(highlightX - 137, w - 145));
    $('#lineChart').innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="greenArea" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#35d69f" stop-opacity=".16"/><stop offset="1" stop-color="#35d69f" stop-opacity="0"/></linearGradient><linearGradient id="redArea" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ff5574" stop-opacity=".14"/><stop offset="1" stop-color="#ff5574" stop-opacity="0"/></linearGradient></defs>${grid}<path class="chart-area-green" d="${area(receiptsPath)}"/><path class="chart-area-red" d="${area(expensesPath)}"/><path class="chart-line-green" d="${receiptsPath}"/><path class="chart-line-red" d="${expensesPath}"/><path class="chart-line-gold" d="${netPath}"/>${dots('receipts','#35d69f')}${dots('expenses','#ff5574')}${dots('net','#e2b35d')}${labels}<line class="chart-highlight" x1="${highlightX}" x2="${highlightX}" y1="${y(Math.max(0,current.net))}" y2="${baseline}"/><g transform="translate(${tooltipX},10)"><rect class="chart-tooltip" width="137" height="66" rx="8"/><text x="9" y="15" fill="#dde4eb" font-size="9">${fmtMonthYear.format(current.date).replace('.', '')}</text><circle cx="10" cy="29" r="3" fill="#35d69f"/><text x="18" y="32" fill="#aebac5" font-size="8">Receitas</text><text x="128" y="32" text-anchor="end" fill="#dfe6ec" font-size="8">${formatMoney(current.receipts)}</text><circle cx="10" cy="43" r="3" fill="#ff5574"/><text x="18" y="46" fill="#aebac5" font-size="8">Despesas</text><text x="128" y="46" text-anchor="end" fill="#dfe6ec" font-size="8">${formatMoney(current.expenses)}</text><circle cx="10" cy="57" r="3" fill="#e2b35d"/><text x="18" y="60" fill="#aebac5" font-size="8">Saldo</text><text x="128" y="60" text-anchor="end" fill="#dfe6ec" font-size="8">${formatMoney(current.net)}</text></g></svg>`;
  }

  function renderCategoryList() {
    const ref = referenceDate();
    const monthButton = $('.category-panel .mini-select');
    if (monthButton) monthButton.textContent = `${fmtMonth.format(ref).replace('.', '')}⌄`;
    const rows = categoryBreakdown();
    const total = sum(rows, row => row.value);
    const visible = rows.slice(0, 6);
    let cursor = 0;
    const segments = visible.length ? visible.map((row, index) => {
      const start = cursor;
      cursor += row.percent;
      return `${row.color} ${start.toFixed(2)}% ${index === visible.length - 1 ? '100' : cursor.toFixed(2)}%`;
    }).join(',') : '#223443 0 100%';
    $('#categoryDonut').style.background = `conic-gradient(${segments})`;
    $('#categoryDonut').setAttribute('aria-label', `Total de gastos ${formatMoney(total)}`);
    $('#categoryTotal').textContent = formatMoney(total);
    $('#categoryList').innerHTML = visible.map(row => `<div><span><i style="background:${row.color}"></i>${escapeHtml(row.name)} <em>${row.percent.toFixed(0)}%</em></span><b>${formatMoney(row.value)}</b></div>`).join('') || '<div><span>Sem despesas</span><b>0%</b></div>';
  }

  function renderDashboardCard() {
    const card = state.cards[0];
    if (!card) {
      $('#dashboardCardPreview').classList.add('empty-card');
      $('#dashboardCardBrand').textContent = '—';
      $('#dashboardCardName').textContent = 'Nenhum cartão';
      $('#dashboardCardNumber').textContent = 'Cadastre um cartão';
      $('#dashboardCardHolder').textContent = settings.name.toUpperCase();
      $('#dashboardCardStats').innerHTML = '<div><dt>Limite Total</dt><dd>R$ 0,00</dd></div><div><dt>Limite Disponível</dt><dd class="positive">R$ 0,00</dd></div>';
      return;
    }
    const stats = cardStats(card);
    $('#dashboardCardPreview').classList.remove('empty-card');
    $('#dashboardCardPreview').style.background = card.gradient;
    $('#dashboardCardBrand').textContent = card.brand;
    $('#dashboardCardName').textContent = card.name.replace(card.brand, '').trim() || card.name;
    $('#dashboardCardNumber').innerHTML = `**** &nbsp;**** &nbsp;**** &nbsp;${escapeHtml(card.last4)}`;
    $('#dashboardCardHolder').textContent = settings.name.toUpperCase();
    $('#dashboardCardStats').innerHTML = `<div><dt>Limite Total</dt><dd>${formatMoney(card.total)}</dd></div><div><dt>Limite Disponível</dt><dd class="positive">${formatMoney(stats.available)}</dd></div><div><dt>Fechamento</dt><dd>${escapeHtml(card.close)}</dd></div><div><dt>Vencimento</dt><dd>${escapeHtml(card.due)}</dd></div>`;
  }

  function receipt() { return '<span class="receipt-thumb" title="Comprovante anexado"><i></i><i></i><i></i><i></i></span>'; }
  function merchantCell(transaction) { return `<div class="merchant"><span class="merchant-logo" style="background:${transaction.logoColor || categoryColor(transaction.category)}">${escapeHtml(transaction.logo || transaction.description.slice(0,2).toUpperCase())}</span><span>${escapeHtml(transaction.description)}</span></div>`; }

  function sortedTransactions() { return [...state.transactions].sort((a, b) => (parseDate(b.date)?.getTime() || 0) - (parseDate(a.date)?.getTime() || 0)); }

  function renderRecentPurchases() {
    const rows = sortedTransactions().filter(item => item.type === 'Saída').slice(0, 5);
    $('#recentPurchasesBody').innerHTML = rows.map(item => `<tr><td>${merchantCell(item)}</td><td><span class="cat-dot" style="background:${categoryColor(item.category)}"></span>${escapeHtml(item.category)}</td><td>${money(item.value)}</td><td>${escapeHtml(item.payment)}</td><td>${escapeHtml(item.installments || '—')}</td><td>${item.receipt ? receipt() : '—'}</td></tr>`).join('') || '<tr><td colspan="6">Nenhuma compra cadastrada.</td></tr>';
  }

  function renderInstallments() {
    $('#installmentsList').innerHTML = state.installments.map(item => `<div class="installment-item"><span class="brand-app" style="background:${item.color}">${escapeHtml(item.logo)}</span><div class="installment-copy"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.subtitle)}</small><div class="progress-row"><div class="progress"><i style="width:${clamp(item.current/item.total*100,0,100)}%"></i></div><span>${item.current}/${item.total}</span></div></div><div class="installment-date"><small>Próx. venc.</small><strong>${escapeHtml(item.due)}</strong><span>${formatMoney(item.value)}</span></div></div>`).join('');
  }

  function cardLabel(cardId) {
    const card = state.cards.find(item => item.id === cardId);
    return card ? `${card.name} • ${card.last4}` : 'Sem cartão vinculado';
  }

  function renderThirdMini() {
    $('#thirdMiniList').innerHTML = state.thirdParties.slice(0,4).map(item => `<div class="third-mini-row" title="${escapeHtml(cardLabel(item.cardId))} • ${item.installmentsCurrent}/${item.installmentsTotal}"><span class="mini-avatar">${item.avatar ? `<img src="${escapeHtml(item.avatar)}" alt="">` : escapeHtml(item.initials)}</span><strong>${escapeHtml(item.name)}</strong><span class="status ${item.status === 'A Receber' ? 'positive' : 'negative'}">${escapeHtml(item.status)}</span><span class="amount">${formatMoney(item.value)}</span></div>`).join('') || '<div class="empty-mini">Nenhum registro.</div>';
  }

  function renderDashboardInvoices() {
    const open = state.invoices.filter(item => item.status === 'Aberta');
    const paid = state.invoices.filter(item => item.status === 'Paga');
    $('#dashboardInvoiceSummary').innerHTML = `<div class="invoice-stat open"><span>Abertas</span><strong>${open.length}</strong><small>${formatMoney(sum(open,item=>item.value))}</small><div class="doc-icon">▤</div></div><div class="invoice-stat paid"><span>Pagas</span><strong>${paid.length}</strong><small>${formatMoney(sum(paid,item=>item.value))}</small><div class="shield-check">✓</div></div>`;
  }

  function renderTransactions() {
    const q = ($('#transactionSearch')?.value || '').trim().toLowerCase();
    const filter = $('#transactionFilter')?.value || 'all';
    const rows = sortedTransactions().filter(item => (!q || `${item.description} ${item.category} ${item.payment} ${cardLabel(item.cardId)}`.toLowerCase().includes(q)) && (filter === 'all' || item.category === filter));
    $('#transactionsBody').innerHTML = rows.map(item => `<tr><td>${formatDate(item.date)}</td><td>${merchantCell(item)}${item.cardId ? `<small class="row-subtitle">${escapeHtml(cardLabel(item.cardId))}</small>` : ''}</td><td>${escapeHtml(item.category)}</td><td><span class="${item.type === 'Entrada' ? 'positive' : 'negative'}">${escapeHtml(item.type)}</span></td><td>${escapeHtml(item.payment)}</td><td class="${item.type === 'Entrada' ? 'positive' : 'negative'}">${item.type === 'Entrada' ? '+ ' : '- '}${money(item.value)}</td><td><div class="action-buttons"><button class="table-action" data-edit-transaction="${item.id}" title="Editar">${svg('i-edit')}</button><button class="table-action delete" data-delete-transaction="${item.id}" title="Excluir">${svg('i-trash')}</button></div></td></tr>`).join('') || '<tr><td colspan="7">Nenhuma transação encontrada.</td></tr>';

    const selectedCardId = $('#invoiceCardFilter')?.value || state.cards[0]?.id || '';
    const creditRows = sortedTransactions().filter(item => item.type === 'Saída' && item.payment === 'Crédito' && (!selectedCardId || item.cardId === selectedCardId));
    $('#invoicePurchasesBody').innerHTML = creditRows.slice(0,8).map(item => `<tr><td>${formatDate(item.date)}</td><td>${merchantCell(item)}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.installments || '—')}</td><td>${money(item.value)}</td></tr>`).join('') || '<tr><td colspan="5">Nenhuma compra vinculada a este cartão.</td></tr>';

    const ref = referenceDate();
    const key = monthKey(ref);
    const monthRows = state.transactions.filter(item => parseDate(item.date) && monthKey(parseDate(item.date)) === key);
    const income = sum(monthRows.filter(item => item.type === 'Entrada'), item => item.value);
    const expense = sum(monthRows.filter(item => item.type === 'Saída'), item => item.value);
    $('#transactionIncomeMetric').textContent = formatMoney(income);
    $('#transactionExpenseMetric').textContent = formatMoney(expense);
    $('#transactionBalanceMetric').textContent = formatMoney(income - expense);
  }

  function renderCards() {
    $('#cardsPageGrid').innerHTML = state.cards.map(card => {
      const stats = cardStats(card);
      return `<article class="card-page-item" style="background:${card.gradient}"><div class="card-page-top"><strong>${escapeHtml(card.brand)}</strong><span>${escapeHtml(card.name)}</span></div><div class="card-page-chip"></div><div class="card-page-number">•••• &nbsp;•••• &nbsp;•••• &nbsp;${escapeHtml(card.last4)}</div><div class="card-page-info"><div><span>TITULAR</span><strong>${escapeHtml(settings.name.toUpperCase())}</strong></div><div><span>VENCIMENTO</span><strong>${escapeHtml(card.due)}</strong></div><div><span>LIMITE TOTAL</span><strong>${formatMoney(card.total)}</strong></div><div><span>DISPONÍVEL</span><strong class="positive">${formatMoney(stats.available)}</strong></div></div><div class="card-usage-line"><i style="width:${stats.percent}%"></i></div><small class="card-usage-copy">${formatMoney(stats.used)} utilizados</small><div class="card-page-actions"><button class="table-action" data-edit-card="${card.id}" title="Editar">${svg('i-edit')}</button><button class="table-action delete" data-delete-card="${card.id}" title="Excluir">${svg('i-trash')}</button></div></article>`;
    }).join('') || '<article class="panel empty-state">Nenhum cartão cadastrado.</article>';

    const cardSelect = $('#invoiceCardFilter');
    const previous = cardSelect?.value;
    if (cardSelect) {
      cardSelect.innerHTML = state.cards.map(card => `<option value="${card.id}">${escapeHtml(card.name)} • ${escapeHtml(card.last4)}</option>`).join('');
      if (state.cards.some(card => card.id === previous)) cardSelect.value = previous;
    }

    const cards = state.cards.map(card => ({ card, ...cardStats(card) }));
    const total = sum(cards, item => item.card.total);
    const used = sum(cards, item => item.used);
    const available = Math.max(0, total - used);
    $('#limitOverview').innerHTML = `<div class="limit-total-row"><div><span>Limite total</span><strong>${formatMoney(total)}</strong></div><div><span>Limite utilizado</span><strong>${formatMoney(used)}</strong></div><div><span>Disponível</span><strong class="positive">${formatMoney(available)}</strong></div><div class="big-progress"><i style="width:${total ? clamp(used/total*100,0,100) : 0}%"></i></div></div><div class="limit-card-list">${cards.map(item => `<div class="limit-card-row"><div><strong>${escapeHtml(item.card.name)}</strong><small>•••• ${escapeHtml(item.card.last4)}</small></div><div><span>Total</span><b>${formatMoney(item.card.total)}</b></div><div><span>Utilizado</span><b>${formatMoney(item.used)}</b></div><div><span>Restante</span><b class="positive">${formatMoney(item.available)}</b></div><div class="limit-row-progress"><i style="width:${item.percent}%"></i></div></div>`).join('') || '<div class="empty-state">Cadastre um cartão para visualizar os limites.</div>'}</div>`;
  }

  function renderInvoices() {
    $('#invoiceCards').innerHTML = state.invoices.map(invoice => `<article class="invoice-page-card"><div class="invoice-top"><strong>${escapeHtml(invoice.card || cardLabel(invoice.cardId))}</strong><span class="invoice-badge ${invoice.status === 'Paga' ? 'paid' : 'open'}">${escapeHtml(invoice.status)}</span></div><strong>${formatMoney(invoice.value)}</strong><small>${escapeHtml(invoice.month)}</small><div class="invoice-details"><span>Vencimento</span><b>${escapeHtml(invoice.due)}</b></div>${invoice.status === 'Aberta' ? `<button class="primary-button" data-pay-invoice="${invoice.id}">Pagar fatura</button>` : '<button class="secondary-button">Ver comprovante</button>'}</article>`).join('') || '<article class="panel empty-state">Nenhuma fatura cadastrada.</article>';
  }

  function renderPlanning() {
    const chip = $('.month-chip');
    if (chip) chip.textContent = fmtMonthYear.format(referenceDate()).replace('.', '');
    $('#budgetList').innerHTML = state.budgets.map(item => { const percent = Math.min(100, item.limit ? item.used/item.limit*100 : 0); return `<div class="budget-row"><div class="budget-head"><strong>${escapeHtml(item.name)}</strong><span>${formatMoney(item.used)} de ${formatMoney(item.limit)}</span></div><div class="budget-progress"><i style="width:${percent}%;background:${percent > 90 ? '#ff5574' : item.color}"></i></div></div>`; }).join('');
    $('#goalsList').innerHTML = state.goals.map(item => `<div class="goal-row"><div class="goal-head"><strong>${escapeHtml(item.name)}</strong><span>${Math.round(item.target ? item.current/item.target*100 : 0)}%</span></div><small>${formatMoney(item.current)} de ${formatMoney(item.target)}</small><div class="goal-progress"><i style="width:${clamp(item.target ? item.current/item.target*100 : 0,0,100)}%;background:${item.color}"></i></div></div>`).join('');
    $('#planningInstallments').innerHTML = state.installments.map(item => `<div class="planning-installment"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.subtitle)} • ${item.current}/${item.total}</small><div class="progress"><i style="width:${clamp(item.current/item.total*100,0,100)}%"></i></div><div class="date-price"><span>${escapeHtml(item.due)}</span><b>${formatMoney(item.value)}</b></div></div>`).join('');
  }

  function renderThirdParties() {
    const totals = thirdTotals();
    $('#thirdReceivableMetric').textContent = formatMoney(totals.receivable);
    $('#thirdPayableMetric').textContent = formatMoney(totals.payable);
    $('#thirdNetMetric').textContent = formatMoney(totals.net);
    $('#thirdPartiesGrid').innerHTML = state.thirdParties.map(item => `<article class="panel third-card"><span class="mini-avatar">${item.avatar ? `<img src="${escapeHtml(item.avatar)}" alt="">` : escapeHtml(item.initials)}</span><div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p><div class="third-meta"><span>${svg('i-card')}${escapeHtml(cardLabel(item.cardId))}</span><span>${svg('i-calendar')}Parcela ${item.installmentsCurrent}/${item.installmentsTotal} • ${formatDate(item.purchaseDate)}</span></div></div><div class="third-values"><strong>${formatMoney(item.value)}</strong><span class="${item.status === 'A Receber' ? 'positive' : 'negative'}">${escapeHtml(item.status)}</span></div><div class="third-actions"><button class="secondary-button" data-edit-third="${item.id}">Editar</button><button class="secondary-button" data-settle-third="${item.id}">Marcar como resolvido</button></div></article>`).join('') || '<article class="panel empty-state">Nenhum registro de terceiro.</article>';
  }

  function renderReports() {
    const rows = monthlyFlows(12);
    let patrimony = Number(state.meta.openingBalance || 0);
    const values = rows.map(row => { patrimony += row.net; return Math.max(0, patrimony); });
    const maxValue = Math.max(1000, ...values);
    const axisMax = Math.ceil(maxValue / 10000) * 10000;
    const w = 720, h = 250, p = { l:42, r:15, t:15, b:30 };
    const barSlot = (w - p.l - p.r) / Math.max(1, values.length);
    const barW = barSlot * .52;
    const y = value => p.t + (axisMax - value) * (h - p.t - p.b) / axisMax;
    const bars = values.map((value, index) => { const x = p.l + index * barSlot + (barSlot - barW) / 2; const height = h - p.b - y(value); return `<rect x="${x}" y="${y(value)}" width="${barW}" height="${height}" rx="5" fill="url(#barGrad)"/><text x="${x+barW/2}" y="${h-9}" class="chart-axis-label" text-anchor="middle">${fmtMonth.format(rows[index].date).replace('.','')}</text>`; }).join('');
    const grid = Array.from({length:6}, (_, index) => axisMax * index / 5).map(value => `<line class="chart-grid-line" x1="${p.l}" x2="${w-p.r}" y1="${y(value)}" y2="${y(value)}"/><text class="chart-axis-label" x="0" y="${y(value)+3}">${Math.round(value/1000)}k</text>`).join('');
    $('#reportBarChart').innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e2b35d"/><stop offset="1" stop-color="#89612e"/></linearGradient></defs>${grid}${bars}</svg>`;

    const summary = financialSummary();
    const invested = sum(state.goals, item => item.current);
    const committed = sum(state.cards, card => cardStats(card).used) + summary.payable;
    const distribution = [
      { name:'Disponível', value:Math.max(0,summary.balance), color:'#2dd4a8' },
      { name:'A receber', value:summary.receivable, color:'#d9aa50' },
      { name:'Investido', value:invested, color:'#8b5cf6' },
      { name:'Comprometido', value:committed, color:'#ef476f' }
    ];
    const total = sum(distribution, item => item.value);
    let cursor = 0;
    const segments = distribution.map((item, index) => { const start = cursor; const percent = total ? item.value/total*100 : 0; cursor += percent; return `${item.color} ${start}% ${index === distribution.length - 1 ? 100 : cursor}%`; }).join(',');
    $('#reportDistributionDonut').style.background = `conic-gradient(${segments || '#223443 0 100%'})`;
    $('#reportPatrimony').textContent = formatMoney(total);
    $('#reportDistributionList').innerHTML = distribution.map(item => `<div><span><i style="background:${item.color}"></i>${item.name}</span><b>${total ? Math.round(item.value/total*100) : 0}%</b></div>`).join('');

    const categories = categoryBreakdown();
    const largest = categories[0] || { name:'Sem dados', percent:0 };
    const avgSavings = rows.length ? sum(rows, row => row.net) / rows.length : 0;
    const totalReceipts = sum(rows, row => row.receipts);
    const totalExpenses = sum(rows, row => row.expenses);
    const savingsRate = totalReceipts ? (totalReceipts - totalExpenses) / totalReceipts * 100 : 0;
    const closedInvoices = state.invoices.filter(item => item.status === 'Paga').length;
    const invoiceRate = state.invoices.length ? closedInvoices / state.invoices.length * 100 : 100;
    $('#reportInsights').innerHTML = `<article class="panel insight"><span>Maior categoria</span><strong>${escapeHtml(largest.name)}</strong><small>${largest.percent.toFixed(0)}% das despesas</small></article><article class="panel insight"><span>Economia média</span><strong class="${avgSavings >= 0 ? 'positive' : 'negative'}">${formatMoney(avgSavings)}</strong><small>por mês</small></article><article class="panel insight"><span>Taxa de poupança</span><strong class="gold-text">${savingsRate.toFixed(1).replace('.',',')}%</strong><small>calculada em tempo real</small></article><article class="panel insight"><span>Faturas pagas</span><strong>${invoiceRate.toFixed(0)}%</strong><small>${closedInvoices} de ${state.invoices.length}</small></article>`;
  }

  function greetingData(date = new Date()) {
    const hour = date.getHours();
    if (hour >= 5 && hour < 12) return { text:'Bom dia', icon:'i-sun', className:'day' };
    if (hour >= 12 && hour < 18) return { text:'Boa tarde', icon:'i-sun', className:'day' };
    return { text:'Boa noite', icon:'i-moon', className:'night' };
  }

  function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const clock = $('#digitalClock');
    if (clock) {
      clock.textContent = `${hours}:${minutes}:${seconds}`;
      clock.dateTime = now.toISOString();
    }
    const hourDegrees = (now.getHours() % 12 + now.getMinutes() / 60) * 30;
    const minuteDegrees = now.getMinutes() * 6;
    if ($('#hourHand')) $('#hourHand').style.transform = `translateX(-50%) rotate(${hourDegrees}deg)`;
    if ($('#minuteHand')) $('#minuteHand').style.transform = `translateX(-50%) rotate(${minuteDegrees}deg)`;
    if (currentPage === 'dashboard') renderGreeting();
  }

  function renderGreeting() {
    const firstName = (settings.name || 'Mauro').trim().split(/\s+/)[0] || 'Mauro';
    const greeting = greetingData();
    $('#pageGreeting').innerHTML = `${greeting.text}, ${escapeHtml(firstName)} <span class="greeting-weather ${greeting.className}">${svg(greeting.icon)}</span>`;
    $('#pageSubtitle').textContent = 'Aqui está o resumo da sua vida financeira.';
  }

  function startClock() {
    if (clockTimer) clearInterval(clockTimer);
    updateClock();
    clockTimer = setInterval(updateClock, 1000);
  }

  function goToPage(page) {
    if (!document.querySelector(`#page-${page}`)) page = 'dashboard';
    currentPage = page;
    $$('.page').forEach(element => element.classList.toggle('active', element.id === `page-${page}`));
    $$('.nav-item').forEach(item => {
      const selected = item.dataset.page === page;
      item.classList.toggle('active', selected);
      if (selected) item.setAttribute('aria-current','page'); else item.removeAttribute('aria-current');
    });
    const titles = {
      transactions:['Transações','Registre e acompanhe todas as movimentações.'],
      cards:['Cartões','Limites, fechamentos e vencimentos em um só lugar.'],
      invoices:['Faturas','Controle mensal das suas faturas.'],
      planning:['Planejamento','Organize metas, orçamentos e parcelas.'],
      'third-parties':['Terceiros','Controle valores compartilhados com outras pessoas.'],
      reports:['Relatórios','Indicadores atualizados conforme seus registros.'],
      settings:['Configurações','Personalize sua conta, backups e integrações.']
    };
    if (page === 'dashboard') renderGreeting();
    else {
      const [title, subtitle] = titles[page];
      $('#pageGreeting').textContent = title;
      $('#pageSubtitle').textContent = subtitle;
    }
    $('.main-content').scrollTop = 0;
    if (window.innerWidth < 1120) $('#sidebar')?.classList.remove('mobile-open');
  }

  function cardOptions(includeBlank = true) {
    const options = state.cards.map(card => ({ value:card.id, label:`${card.name} • ${card.last4}` }));
    return includeBlank ? [{ value:'', label:'Nenhum cartão' }, ...options] : options;
  }

  function modalSchema(type) {
    const schemas = {
      transaction: { title:'Nova transação', subtitle:'Adicione uma entrada ou saída.', fields:[
        {name:'description',label:'Descrição',kind:'text',placeholder:'Ex.: Supermercado',full:true,required:true},
        {name:'value',label:'Valor',kind:'number',placeholder:'0,00',required:true},
        {name:'date',label:'Data',kind:'date',required:true},
        {name:'category',label:'Categoria',kind:'select',options:['Alimentação','Transporte','Compras','Recebimento','Saúde','Assinatura','Moradia','Outros']},
        {name:'type',label:'Tipo',kind:'select',options:['Saída','Entrada']},
        {name:'payment',label:'Forma de pagamento',kind:'select',options:['Pix','Dinheiro','Débito','Crédito','Conta']},
        {name:'cardId',label:'Cartão utilizado',kind:'select',options:cardOptions(true)},
        {name:'installments',label:'Parcelas',kind:'text',placeholder:'Ex.: 1x ou 3x'},
        {name:'receipt',label:'Comprovante anexado',kind:'select',options:['Sim','Não']}
      ]},
      quick: { title:'Nova movimentação', subtitle:'Conclua a ação financeira.', fields:[
        {name:'description',label:'Descrição',kind:'text',required:true,full:true},
        {name:'value',label:'Valor',kind:'number',required:true},
        {name:'type',label:'Tipo',kind:'select',options:['Saída','Entrada']},
        {name:'payment',label:'Forma',kind:'select',options:['Pix','Dinheiro','Débito','Crédito','Conta']},
        {name:'cardId',label:'Cartão utilizado',kind:'select',options:cardOptions(true)},
        {name:'date',label:'Data',kind:'date',required:true}
      ]},
      card: { title:'Novo cartão', subtitle:'Cadastre os dados principais do cartão.', fields:[
        {name:'name',label:'Nome do cartão',kind:'text',placeholder:'Ex.: Visa Infinite',required:true},
        {name:'brand',label:'Bandeira',kind:'select',options:['VISA','Mastercard','Elo','American Express']},
        {name:'last4',label:'Últimos 4 dígitos',kind:'text',placeholder:'0000',required:true},
        {name:'total',label:'Limite total',kind:'number',required:true},
        {name:'available',label:'Limite disponível atual',kind:'number',required:true},
        {name:'close',label:'Fechamento',kind:'text',placeholder:'05/06'},
        {name:'due',label:'Vencimento',kind:'text',placeholder:'15/06'}
      ]},
      invoice: { title:'Adicionar fatura', subtitle:'Registre uma fatura mensal.', fields:[
        {name:'cardId',label:'Cartão',kind:'select',options:cardOptions(false),required:true},
        {name:'month',label:'Mês',kind:'text',placeholder:'Junho/2026',required:true},
        {name:'value',label:'Valor',kind:'number',required:true},
        {name:'due',label:'Vencimento',kind:'text',placeholder:'15/06/2026'},
        {name:'status',label:'Status',kind:'select',options:['Aberta','Paga']}
      ]},
      plan: { title:'Novo planejamento', subtitle:'Crie uma meta financeira.', fields:[
        {name:'name',label:'Nome da meta',kind:'text',required:true,full:true},
        {name:'current',label:'Valor atual',kind:'number',required:true},
        {name:'target',label:'Valor desejado',kind:'number',required:true}
      ]},
      third: { title:'Novo registro de terceiro', subtitle:'Vincule valor, cartão e parcelas da compra.', fields:[
        {name:'name',label:'Pessoa ou empresa',kind:'text',required:true},
        {name:'description',label:'Descrição',kind:'text',required:true,full:true},
        {name:'status',label:'Situação',kind:'select',options:['A Receber','A Pagar']},
        {name:'value',label:'Valor total',kind:'number',required:true},
        {name:'purchaseDate',label:'Data da compra',kind:'date',required:true},
        {name:'cardId',label:'Cartão utilizado',kind:'select',options:cardOptions(true)},
        {name:'installmentsCurrent',label:'Parcela atual',kind:'number',required:true},
        {name:'installmentsTotal',label:'Total de parcelas',kind:'number',required:true}
      ]}
    };
    return schemas[type];
  }

  function optionMarkup(option, selected) {
    const value = typeof option === 'object' ? option.value : option;
    const label = typeof option === 'object' ? option.label : option;
    return `<option value="${escapeHtml(value)}" ${String(selected) === String(value) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }

  function openModal(type, data = null, id = null) {
    currentModal = type;
    editingId = id;
    const schema = modalSchema(type);
    if (!schema) return;
    $('#modalTitle').textContent = id ? schema.title.replace('Novo','Editar').replace('Nova','Editar') : schema.title;
    $('#modalSubtitle').textContent = schema.subtitle;
    const enriched = data ? { ...data } : {};
    if (type === 'card' && data) enriched.available = cardStats(data).available;
    if (type === 'invoice' && data && !enriched.cardId) enriched.cardId = findCardIdFromText(enriched.card);
    $('#modalFields').innerHTML = schema.fields.map(field => {
      const value = enriched[field.name] ?? (field.name === 'date' || field.name === 'purchaseDate' ? new Date().toISOString().slice(0,10) : field.name.startsWith('installments') ? 1 : '');
      if (field.kind === 'select') return `<label class="${field.full ? 'full' : ''}">${field.label}<select name="${field.name}" ${field.required ? 'required' : ''}>${field.options.map(option => optionMarkup(option,value)).join('')}</select></label>`;
      return `<label class="${field.full ? 'full' : ''}">${field.label}<input name="${field.name}" type="${field.kind}" ${field.kind === 'number' ? 'step="0.01" min="0"' : ''} value="${escapeHtml(value)}" placeholder="${escapeHtml(field.placeholder || '')}" ${field.required ? 'required' : ''}></label>`;
    }).join('');
    $('#modalOverlay').classList.add('open');
    $('#modalOverlay').setAttribute('aria-hidden','false');
    setTimeout(() => $('#modalFields input')?.focus(), 50);
  }

  function closeModal() {
    $('#modalOverlay').classList.remove('open');
    $('#modalOverlay').setAttribute('aria-hidden','true');
    currentModal = null;
    editingId = null;
  }

  function inferCategory(text = '') {
    const source = text.toLowerCase();
    if (/mercado|ifood|restaurante|comida/.test(source)) return 'Alimentação';
    if (/uber|posto|combustível|transporte/.test(source)) return 'Transporte';
    if (/salário|recebido|pix recebido/.test(source)) return 'Recebimento';
    if (/netflix|prime|spotify/.test(source)) return 'Assinatura';
    return 'Compras';
  }

  function handleModalSubmit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (currentModal === 'transaction' || currentModal === 'quick') {
      const category = data.category || inferCategory(data.description);
      const item = {
        id: editingId || uid('tx'), date:data.date, description:data.description, category, type:data.type,
        payment:data.payment, cardId:data.payment === 'Crédito' ? (data.cardId || '') : '', value:Number(data.value),
        installments:data.installments || '—', logo:(data.description || '?').slice(0,2).toUpperCase(), logoColor:categoryColor(category), receipt:data.receipt === 'Sim'
      };
      if (editingId) state.transactions = state.transactions.map(transaction => transaction.id === editingId ? { ...transaction, ...item } : transaction);
      else state.transactions.unshift(item);
      toast(editingId ? 'Transação atualizada em tempo real.' : 'Transação adicionada e painéis atualizados.');
    } else if (currentModal === 'card') {
      const id = editingId || uid('card');
      const linkedSpend = editingId ? cardLinkedSpend(id) : 0;
      const total = Number(data.total);
      const available = Number(data.available);
      const item = {
        id, name:data.name, brand:data.brand, last4:data.last4, holder:settings.name.toUpperCase(), total,
        openingUsed:Math.max(0,total - available - linkedSpend), close:data.close, due:data.due,
        gradient: state.cards.find(card => card.id === id)?.gradient || 'linear-gradient(145deg,#1c2430,#080b10 72%)'
      };
      if (editingId) state.cards = state.cards.map(card => card.id === editingId ? { ...card, ...item } : card);
      else state.cards.push(item);
      toast('Cartão salvo e resumo de limites recalculado.');
    } else if (currentModal === 'invoice') {
      const card = state.cards.find(item => item.id === data.cardId);
      state.invoices.unshift({ id:uid('invoice'), cardId:data.cardId, card:card ? `${card.name} • ${card.last4}` : 'Cartão', month:data.month, value:Number(data.value), due:data.due, status:data.status });
      toast('Fatura adicionada.');
    } else if (currentModal === 'plan') {
      state.goals.push({ name:data.name, current:Number(data.current), target:Number(data.target), color:'#e2b35d' });
      toast('Planejamento criado.');
    } else if (currentModal === 'third') {
      const item = {
        id:editingId || uid('third'), name:data.name, description:data.description, status:data.status, value:Number(data.value),
        initials:data.name.split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase(),
        avatar:state.thirdParties.find(record => record.id === editingId)?.avatar || '', cardId:data.cardId || '',
        installmentsCurrent:Math.max(1,Number(data.installmentsCurrent)||1), installmentsTotal:Math.max(1,Number(data.installmentsTotal)||1),
        purchaseDate:data.purchaseDate, category:'Terceiros'
      };
      if (editingId) state.thirdParties = state.thirdParties.map(record => record.id === editingId ? { ...record, ...item } : record);
      else state.thirdParties.push(item);
      toast('Registro de terceiro salvo e cálculos atualizados.');
    }
    persist();
    renderAll();
    closeModal();
  }

  function toast(message, error = false) {
    const element = document.createElement('div');
    element.className = `toast${error ? ' error' : ''}`;
    element.textContent = message;
    $('#toastContainer').appendChild(element);
    setTimeout(() => element.remove(), 3200);
  }

  function downloadBlob(blob, filename) {
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  }

  function exportCsv() {
    const lines = [['Data','Descrição','Categoria','Tipo','Forma','Cartão','Parcelas','Valor'], ...sortedTransactions().map(item => [formatDate(item.date),item.description,item.category,item.type,item.payment,cardLabel(item.cardId),item.installments,item.value.toFixed(2).replace('.',',')])];
    const csv = lines.map(row => row.map(value => `"${String(value).replace(/"/g,'""')}"`).join(';')).join('\n');
    downloadBlob(new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'}), 'transacoes-finance-premium.csv');
    toast('Arquivo CSV gerado.');
  }

  function backupPayload() {
    return { app:'Finance Premium', version:BACKUP_VERSION, exportedAt:new Date().toISOString(), state, settings:{...settings, driveFileId:''} };
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(backupPayload(), null, 2)], { type:'application/json;charset=utf-8' });
    downloadBlob(blob, `finance-premium-backup-${new Date().toISOString().slice(0,10)}.json`);
    toast('Backup completo exportado.');
  }

  async function importBackupFile(file) {
    try {
      const payload = JSON.parse(await file.text());
      if (!payload || typeof payload !== 'object' || !payload.state) throw new Error('Arquivo inválido');
      state = migrateState(payload.state);
      settings = { ...settings, ...(payload.settings || {}), avatar:(payload.settings?.avatar || settings.avatar || defaultAvatar) };
      persistSettings();
      persist();
      renderAll();
      toast('Backup importado com sucesso.');
    } catch (error) { toast(`Falha ao importar backup: ${error.message}`, true); }
  }

  function setDriveStatus(message, stateName = '') {
    const element = $('#driveStatus');
    if (!element) return;
    element.className = `drive-status ${stateName}`;
    element.querySelector('span').textContent = message;
  }

  function waitForGoogleIdentity(timeout = 8000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        if (window.google?.accounts?.oauth2) return resolve();
        if (Date.now() - started > timeout) return reject(new Error('Biblioteca do Google não carregou. Verifique a internet.'));
        setTimeout(check, 120);
      };
      check();
    });
  }

  async function requestDriveToken() {
    const clientId = ($('#googleClientId')?.value || settings.googleClientId || '').trim();
    if (!clientId) throw new Error('Informe o ID do cliente OAuth nas configurações.');
    settings.googleClientId = clientId;
    persistSettings();
    await waitForGoogleIdentity();
    return new Promise((resolve, reject) => {
      driveTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: response => {
          if (response.error) return reject(new Error(response.error_description || response.error));
          driveAccessToken = response.access_token;
          resolve(driveAccessToken);
        },
        error_callback: response => reject(new Error(response?.message || 'Autorização cancelada.'))
      });
      driveTokenClient.requestAccessToken({ prompt: driveAccessToken ? '' : 'consent' });
    });
  }

  function driveMultipartBody(payload) {
    const boundary = `finance_boundary_${Date.now()}`;
    const metadata = { name:DRIVE_FILE_NAME, mimeType:'application/json', appProperties:{ app:'finance-premium', version:String(BACKUP_VERSION) } };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload, null, 2)}\r\n--${boundary}--`;
    return { boundary, body };
  }

  async function saveBackupToDrive() {
    try {
      setDriveStatus('Solicitando autorização...', 'working');
      const token = await requestDriveToken();
      const multipart = driveMultipartBody(backupPayload());
      const update = Boolean(settings.driveFileId);
      const endpoint = update ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(settings.driveFileId)}?uploadType=multipart&fields=id,name,modifiedTime` : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime';
      let response = await fetch(endpoint, { method:update ? 'PATCH' : 'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':`multipart/related; boundary=${multipart.boundary}` }, body:multipart.body });
      if (response.status === 404 && update) {
        settings.driveFileId = '';
        response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime', { method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':`multipart/related; boundary=${multipart.boundary}` }, body:multipart.body });
      }
      if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error?.message || `Erro ${response.status}`);
      const result = await response.json();
      settings.driveFileId = result.id;
      persistSettings();
      setDriveStatus(`Backup salvo no Drive em ${new Date().toLocaleTimeString('pt-BR')}`, 'connected');
      toast('Backup salvo no Google Drive.');
    } catch (error) { setDriveStatus(error.message, 'error'); toast(`Google Drive: ${error.message}`, true); }
  }

  async function restoreBackupFromDrive() {
    try {
      setDriveStatus('Localizando o backup mais recente...', 'working');
      const token = await requestDriveToken();
      let fileId = settings.driveFileId;
      if (!fileId) {
        const query = encodeURIComponent(`name='${DRIVE_FILE_NAME.replace(/'/g,"\\'")}' and trashed=false`);
        const listResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime desc&pageSize=1&fields=files(id,name,modifiedTime)`, { headers:{ Authorization:`Bearer ${token}` } });
        if (!listResponse.ok) throw new Error((await listResponse.json().catch(() => ({})))?.error?.message || 'Não foi possível listar os backups.');
        const files = (await listResponse.json()).files || [];
        if (!files.length) throw new Error('Nenhum backup do Finance Premium foi encontrado.');
        fileId = files[0].id;
      }
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers:{ Authorization:`Bearer ${token}` } });
      if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error?.message || 'Não foi possível baixar o backup.');
      const payload = await response.json();
      if (!payload.state) throw new Error('O arquivo encontrado não é um backup válido.');
      state = migrateState(payload.state);
      settings = { ...settings, ...(payload.settings || {}), driveFileId:fileId, googleClientId:($('#googleClientId').value || settings.googleClientId), avatar:payload.settings?.avatar || settings.avatar || defaultAvatar };
      persistSettings();
      persist();
      renderAll();
      setDriveStatus('Backup restaurado do Google Drive.', 'connected');
      toast('Dados restaurados do Google Drive.');
    } catch (error) { setDriveStatus(error.message, 'error'); toast(`Google Drive: ${error.message}`, true); }
  }

  function renderLastSave() {
    const element = $('#lastLocalSave');
    if (!element) return;
    element.textContent = settings.lastLocalSave ? new Date(settings.lastLocalSave).toLocaleString('pt-BR') : 'Ainda não registrado';
  }

  function applySettings() {
    document.querySelector('.brand-title').textContent = config.appName || 'FINANCE';
    document.querySelector('.brand-subtitle').textContent = config.appSubtitle || 'PREMIUM';
    document.body.classList.toggle('light', settings.theme === 'light');
    document.body.classList.toggle('hide-values', Boolean(settings.hideValues));
    $('#hideValuesToggle').checked = Boolean(settings.hideValues);
    $('#notificationsToggle').checked = settings.notifications !== false;
    $('#localStorageToggle').checked = settings.localStorage !== false;
    $('#settingName').value = settings.name || config.defaultProfile?.name || 'Mauro Silva';
    $('#settingEmail').value = settings.email || config.defaultProfile?.email || 'mauro@finance.local';
    $('#googleClientId').value = settings.googleClientId || '';
    $('#settingsProfileName').textContent = settings.name;
    $('#settingsProfileEmail').textContent = settings.email;
    $$('.profile-copy strong').forEach(element => { element.textContent = settings.name; });
    $$('.profile-copy small').forEach(element => { element.textContent = config.defaultProfile?.plan || 'Conta Premium ◈'; });
    $$('.avatar img').forEach(element => { element.src = settings.avatar || defaultAvatar; element.alt = settings.name; });
    const switchIndicator = $('.theme-switch i');
    if (switchIndicator) switchIndicator.style.left = settings.theme === 'light' ? '36px' : '3px';
    renderLastSave();
    if (settings.driveFileId) setDriveStatus('Backup do Google Drive configurado.', 'connected');
    if (currentPage === 'dashboard') renderGreeting();
  }

  function resetData() {
    if (!confirm('Restaurar todos os dados fictícios originais?')) return;
    state = migrateState(cloneDefault());
    persist();
    renderAll();
    toast('Dados fictícios restaurados.');
  }

  function handlePhoto(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast('Selecione uma imagem PNG, JPG ou WebP.', true);
    if (file.size > 2.5 * 1024 * 1024) return toast('A imagem deve ter no máximo 2,5 MB.', true);
    const reader = new FileReader();
    reader.onload = () => { settings.avatar = reader.result; persistSettings(); applySettings(); toast('Foto do perfil atualizada.'); };
    reader.readAsDataURL(file);
  }

  function bindEvents() {
    document.addEventListener('click', event => {
      const nav = event.target.closest('[data-page]'); if (nav) return goToPage(nav.dataset.page);
      const link = event.target.closest('[data-page-link]'); if (link) return goToPage(link.dataset.pageLink);
      const modal = event.target.closest('[data-modal]'); if (modal) return openModal(modal.dataset.modal);
      const editTransaction = event.target.closest('[data-edit-transaction]');
      if (editTransaction) { const item = state.transactions.find(transaction => transaction.id === editTransaction.dataset.editTransaction); return openModal('transaction',{...item,receipt:item.receipt?'Sim':'Não'},item.id); }
      const deleteTransaction = event.target.closest('[data-delete-transaction]');
      if (deleteTransaction && confirm('Excluir esta transação?')) { state.transactions = state.transactions.filter(item => item.id !== deleteTransaction.dataset.deleteTransaction); persist(); renderAll(); return toast('Transação excluída e painéis atualizados.'); }
      const editCard = event.target.closest('[data-edit-card]');
      if (editCard) { const item = state.cards.find(card => card.id === editCard.dataset.editCard); return openModal('card',item,item.id); }
      const deleteCard = event.target.closest('[data-delete-card]');
      if (deleteCard && confirm('Excluir este cartão? Os registros permanecerão, mas perderão o vínculo.')) { const id = deleteCard.dataset.deleteCard; state.cards = state.cards.filter(card => card.id !== id); state.transactions = state.transactions.map(item => item.cardId === id ? {...item,cardId:''} : item); state.thirdParties = state.thirdParties.map(item => item.cardId === id ? {...item,cardId:''} : item); persist(); renderAll(); return toast('Cartão excluído.'); }
      const editThird = event.target.closest('[data-edit-third]');
      if (editThird) { const item = state.thirdParties.find(record => record.id === editThird.dataset.editThird); return openModal('third',item,item.id); }
      const settleThird = event.target.closest('[data-settle-third]');
      if (settleThird && confirm('Marcar este registro como resolvido?')) { state.thirdParties = state.thirdParties.filter(item => item.id !== settleThird.dataset.settleThird); persist(); renderAll(); return toast('Registro resolvido e totais recalculados.'); }
      const payInvoice = event.target.closest('[data-pay-invoice]');
      if (payInvoice) { state.invoices = state.invoices.map(item => item.id === payInvoice.dataset.payInvoice ? {...item,status:'Paga'} : item); persist(); renderAll(); return toast('Fatura marcada como paga.'); }
      const quick = event.target.closest('[data-quick]');
      if (quick) { const presets = { pix:{description:'Pix',payment:'Pix',type:'Saída'},pay:{description:'Pagamento',payment:'Conta',type:'Saída'},transfer:{description:'Transferência',payment:'Conta',type:'Saída'},deposit:{description:'Depósito',payment:'Conta',type:'Entrada'} }; return openModal('quick',{...presets[quick.dataset.quick],date:new Date().toISOString().slice(0,10)}); }
    });

    $('#modalForm').addEventListener('submit', handleModalSubmit);
    $('#closeModal').addEventListener('click', closeModal);
    $('#cancelModal').addEventListener('click', closeModal);
    $('#modalOverlay').addEventListener('click', event => { if (event.target === $('#modalOverlay')) closeModal(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
    $('#transactionSearch').addEventListener('input', renderTransactions);
    $('#transactionFilter').addEventListener('change', renderTransactions);
    $('#invoiceCardFilter').addEventListener('change', renderTransactions);
    $('#exportTransactions').addEventListener('click', exportCsv);
    $('#printReport').addEventListener('click', () => window.print());
    $('#themeToggle').addEventListener('click', () => { settings.theme = settings.theme === 'dark' ? 'light' : 'dark'; persistSettings(); applySettings(); toast(`Tema ${settings.theme === 'dark' ? 'escuro' : 'claro'} ativado.`); });
    $('#hideValuesToggle').addEventListener('change', event => { settings.hideValues = event.target.checked; persistSettings(); applySettings(); });
    $('#notificationsToggle').addEventListener('change', event => { settings.notifications = event.target.checked; persistSettings(); toast('Preferência de notificações atualizada.'); });
    $('#localStorageToggle').addEventListener('change', event => {
      settings.localStorage = event.target.checked;
      persistSettings();
      if (settings.localStorage) { persist(); toast('Salvamento local ativado.'); }
      else { localStorage.removeItem(STORAGE_KEY); toast('Salvamento local desativado. Os dados atuais permanecem apenas nesta sessão.'); }
    });
    $('#saveProfile').addEventListener('click', () => {
      settings.name = $('#settingName').value.trim() || config.defaultProfile?.name || 'Mauro Silva';
      settings.email = $('#settingEmail').value.trim() || config.defaultProfile?.email || 'mauro@finance.local';
      persistSettings();
      renderAll();
      toast('Perfil atualizado.');
    });
    $('#changePhotoButton').addEventListener('click', () => $('#photoInput').click());
    $('#photoInput').addEventListener('change', event => handlePhoto(event.target.files[0]));
    $('#exportBackup').addEventListener('click', exportBackup);
    $('#importBackup').addEventListener('click', () => $('#backupInput').click());
    $('#backupInput').addEventListener('change', event => { if (event.target.files[0]) importBackupFile(event.target.files[0]); event.target.value = ''; });
    $('#saveDriveBackup').addEventListener('click', saveBackupToDrive);
    $('#restoreDriveBackup').addEventListener('click', restoreBackupFromDrive);
    $('#googleClientId').addEventListener('change', event => { settings.googleClientId = event.target.value.trim(); settings.driveFileId = ''; persistSettings(); setDriveStatus('ID do cliente salvo. Autorize ao usar o Drive.', ''); });
    $('#resetData').addEventListener('click', resetData);
    $('#mobileMenuButton').addEventListener('click', () => $('#sidebar').classList.toggle('mobile-open'));

    window.addEventListener('storage', event => {
      if (event.key === STORAGE_KEY && event.newValue && settings.localStorage !== false) {
        try { state = migrateState(JSON.parse(event.newValue)); renderAll(); toast('Dados sincronizados com outra aba.'); } catch { /* Ignora conteúdo inválido. */ }
      }
      if (event.key === SETTINGS_KEY && event.newValue) {
        try { settings = { ...defaultSettings(), ...JSON.parse(event.newValue) }; applySettings(); } catch { /* Ignora conteúdo inválido. */ }
      }
    });
  }

  renderAll();
  bindEvents();
  startClock();
})();
