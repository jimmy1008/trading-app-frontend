import { showModal, hideModal } from '../components/modal.js';
import { apiPost } from '../../js/api.js';

const EXCHANGES = {
  binance: { name: 'Binance', logo: './assets/img/binance.png' },
  bybit: { name: 'Bybit', logo: './assets/img/bybit.png' },
  bitget: { name: 'Bitget', logo: './assets/img/bitget.png' },
  okx: { name: 'OKX', logo: './assets/img/okx.png' },
  bingx: { name: 'BingX', logo: './assets/img/bingx.png' },
  mexc: { name: 'MEXC', logo: './assets/img/mexc.png' },
  gate: { name: 'Gate.io', logo: './assets/img/gate.png' }
};

const API_STORAGE_KEY = 'apiData';
let apiData = {};
const balances = {};
let currentExchange = null;
const subscribers = [];
const balanceHandlers = [];

export function onExchangeUpdate(handler) {
  if (typeof handler === 'function') {
    subscribers.push(handler);
    handler(buildSnapshot());
  }
}

export function onBalanceUpdate(handler) {
  if (typeof handler !== 'function') return;
  balanceHandlers.push(handler);
  handler(getTotalBalance(), structuredCloneData(balances));
}

function structuredCloneData(data) {
  try {
    return typeof structuredClone === 'function'
      ? structuredClone(data)
      : JSON.parse(JSON.stringify(data));
  } catch {
    return { ...data };
  }
}

function resolveBalanceValue(entry) {
  if (entry == null) return 0;
  if (typeof entry === 'number') return entry;
  return Number(entry.balance) || 0;
}

function buildSnapshot() {
  const snapshot = {};
  Object.keys(apiData).forEach(id => {
    const existing = balances[id];
    const detail = typeof existing === 'object' ? existing : { balance: resolveBalanceValue(existing) };
    snapshot[id] = {
      ...apiData[id],
      meta: EXCHANGES[id] || { name: id },
      ...detail
    };
  });
  return snapshot;
}

function notifySubscribers() {
  const snapshot = buildSnapshot();
  subscribers.forEach(fn => {
    try { fn(snapshot); } catch (err) { console.error(err); }
  });
}

function getTotalBalance() {
  return Object.values(balances).reduce((sum, value) => sum + resolveBalanceValue(value), 0);
}

function notifyBalanceHandlers(total) {
  balanceHandlers.forEach(handler => {
    try {
      handler(total, structuredCloneData(balances));
    } catch (err) {
      console.error(err);
    }
  });
}

function openExchangeEditor(id) {
  const info = EXCHANGES[id] || { name: id };
  currentExchange = id;
  const title = document.getElementById('api-modal-title');
  if (title) title.textContent = `連接 ${info.name || id}`;
  const cfg = apiData[id] || {};
  document.getElementById('exchange-key').value = cfg.apiKey || '';
  document.getElementById('exchange-secret').value = cfg.secretKey || '';
  document.getElementById('exchange-passphrase').value = cfg.passphrase || '';
  hideModal('exchange-picker-bg');
  showModal('api-modal-bg');
}

function loadApiData() {
  try {
    apiData = JSON.parse(localStorage.getItem(API_STORAGE_KEY) || '{}');
  } catch {
    apiData = {};
  }
}

function saveApiData() {
  localStorage.setItem(API_STORAGE_KEY, JSON.stringify(apiData));
}

function renderExchangeList() {
  const list = document.getElementById('exchange-list');
  if (!list) return;
  const connected = Object.keys(apiData);
  if (connected.length === 0) {
    list.innerHTML = '<div class="text-xs text-gray-400 py-1">尚未新增任何交易所</div>';
    notifySubscribers();
    return;
  }

  list.innerHTML = '';
  connected.forEach(id => {
    const info = EXCHANGES[id] || { name: id };
    const logo = info.logo || `./assets/img/${id}.png`;
    const row = document.createElement('div');
    row.className = 'exchange-pill';
    row.innerHTML = `
      <div class="exchange-pill-logo">
        <img src="${logo}" alt="${info.name}" />
      </div>
      <div class="exchange-pill-name">${info.name}</div>
      <span id="${id}-dot" class="status-dot"></span>
    `;
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `編輯 ${info.name}`);
    row.addEventListener('click', () => openExchangeEditor(id));
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openExchangeEditor(id);
      }
    });
    list.appendChild(row);
  });
  notifySubscribers();
}

async function checkExchange(id) {
  const cfg = apiData[id];
  if (!cfg) return;
  const prevValue = resolveBalanceValue(balances[id]);
  try {
    const data = await apiPost(`/check/${id}`, {
      apiKey: cfg.apiKey,
      secretKey: cfg.secretKey,
      passphrase: cfg.passphrase || ''
    });
    const dot = document.getElementById(`${id}-dot`);
    if (dot) {
      if (data.status === 'ok') {
        dot.className = 'status-dot status-ok';
      } else if (data.status === 'warning') {
        dot.className = 'status-dot status-warn';
      } else {
        dot.className = 'status-dot status-error';
      }
    }
    const balanceValue = Number(data.balance) || prevValue;
    const record = {
      balance: balanceValue,
      positions: Array.isArray(data.positions)
        ? data.positions
        : balances[id]?.positions || [],
      updatedAt: Date.now(),
      diff24h: balanceValue - prevValue
    };
    balances[id] = record;
  } catch (error) {
    console.error(error);
    const dot = document.getElementById(`${id}-dot`);
    if (dot) dot.className = 'status-dot status-error';
    balances[id] = {
      balance: prevValue,
      positions: balances[id]?.positions || [],
      updatedAt: Date.now(),
      diff24h: 0
    };
  }
}

async function checkAllExchanges() {
  const ids = Object.keys(apiData);
  for (const id of ids) await checkExchange(id);
  updateTotalBalance();
}

function updateTotalBalance() {
  const sum = getTotalBalance();
  const totalEl = document.getElementById('total-usdt');
  const twdEl = document.getElementById('total-twd');
  if (totalEl) totalEl.textContent = `${sum.toFixed(2)} USDT`;
  if (twdEl) {
    const twd = (sum * 32).toFixed(0);
    twdEl.textContent = `≈ ${twd} TWD`;
  }
  notifyBalanceHandlers(sum);
  notifySubscribers();
}

function bindPickerCards() {
  document.querySelectorAll('.exchange-card').forEach(card => {
    card.addEventListener('click', () => {
      const ex = card.dataset.ex;
      openExchangeEditor(ex);
    });
  });
}

function resetApiForm() {
  ['exchange-key', 'exchange-secret', 'exchange-passphrase'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  currentExchange = null;
}

function bindPickerButtons() {
  document.getElementById('add-exchange-btn')?.addEventListener('click', () => showModal('exchange-picker-bg'));
  document.getElementById('exchange-picker-close')?.addEventListener('click', () => hideModal('exchange-picker-bg'));
  const pickerBg = document.getElementById('exchange-picker-bg');
  pickerBg?.addEventListener('click', e => {
    if (e.target.id === 'exchange-picker-bg') hideModal('exchange-picker-bg');
  });

  document.getElementById('api-cancel')?.addEventListener('click', () => {
    resetApiForm();
    hideModal('api-modal-bg');
  });
  document.getElementById('api-modal-close')?.addEventListener('click', () => {
    resetApiForm();
    hideModal('api-modal-bg');
  });
  const apiBg = document.getElementById('api-modal-bg');
  apiBg?.addEventListener('click', e => {
    if (e.target.id === 'api-modal-bg') {
      resetApiForm();
      hideModal('api-modal-bg');
    }
  });
}

function handleApiSave() {
  const saveBtn = document.getElementById('api-save');
  if (!saveBtn) return;
  saveBtn.addEventListener('click', async () => {
    if (!currentExchange) return;
    const key = document.getElementById('exchange-key').value.trim();
    const secret = document.getElementById('exchange-secret').value.trim();
    const pass = document.getElementById('exchange-passphrase').value.trim();
    if (!key || !secret) {
      alert('請輸入 API Key 與 Secret');
      return;
    }
    apiData[currentExchange] = {
      apiKey: key,
      secretKey: secret,
      passphrase: pass
    };
    saveApiData();
    hideModal('api-modal-bg');
    resetApiForm();
    renderExchangeList();
    await checkExchange(currentExchange);
    updateTotalBalance();
  });
}

export function initExchangeControls() {
  bindPickerButtons();
  bindPickerCards();
  handleApiSave();
  loadApiData();
  renderExchangeList();
  checkAllExchanges();
}

export function getExchangeMeta() {
  return EXCHANGES;
}

export async function refreshBalances() {
  loadApiData();
  renderExchangeList();
  await checkAllExchanges();
}


