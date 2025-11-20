import { onBalanceUpdate, onExchangeUpdate } from './exchanges.js';
console.log('portfolio loaded');
const zhTW = {
  assetOverview: '資產總覽',
  holdingTypes: '持倉種類',
  positions: '倉位數量',
  largestHolding: '最大持倉',
  balance: '餘額',
  change24h: '24 小時變化',
  updated: '最後更新',
  assetCurve: '資產曲線',
  assetDistribution: '資產配置',
  assetIndicators: '資產指標',
  holdings: '持倉列表',
  noHoldings: '尚無持倉資料',
  justNow: '剛剛',
  yesterday: '昨日',
  lowest: '最低',
  highest: '最高',
  connectedExchanges: '已連接交易所'
};


const HISTORY_KEY = 'assetHistory';
const HISTORY_LIMIT = 120;
const TWDRATE = 32;
const CHART_WIDTH = 320;
const CHART_HEIGHT = 240;
const DISTRIBUTION_COLORS = ['#A7C5F9', '#B6E3D5', '#F9D8B4', '#E0C3FC'];
const STABLE_TOKENS = ['USDT', 'USDC', 'BUSD', 'TUSD', 'DAI', 'FDUSD', 'USD', 'UST', 'USTC'];
const HOUR = 60 * 60 * 1000;
const RANGE_CONFIG = {
  1: { durationHours: 24, stepHours: 1, axis: 'time' },
  7: { durationHours: 7 * 24, stepHours: 6, axis: 'date' },
  30: { durationHours: 30 * 24, stepHours: 24, axis: 'date' },
  90: { durationHours: 90 * 24, stepHours: 24, axis: 'date' }
};

let assetHistory = [];
let currentRange = 30;
let balancesSnapshot = {};
let curveHoverCoords = [];

function formatNumber(value, digits = 0) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function applyTranslations() {
  document.querySelectorAll('[data-translate]').forEach(el => {
    const key = el.dataset.translate;
    if (key && zhTW[key]) el.textContent = zhTW[key];
  });
}

function loadHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (Array.isArray(stored)) {
      return stored
        .filter(entry => entry && entry.date)
        .map(entry => ({
          date: entry.date,
          value: Number(entry.value) || 0,
          timestamp: Number(entry.timestamp) || new Date(`${entry.date}T00:00:00`).getTime()
        }));
    }
  } catch {
    // ignore
  }
  return [];
}

function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(assetHistory));
}

function getFormattedDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function updateAssetHistory(total) {
  const today = getFormattedDate();
  const existing = assetHistory.find(entry => entry.date === today);
  const timestamp = Date.now();
  if (existing) {
    existing.value = total;
    existing.timestamp = timestamp;
  } else {
    assetHistory.push({ date: today, value: total, timestamp });
    while (assetHistory.length > HISTORY_LIMIT) assetHistory.shift();
  }
  saveHistory();
}

function computeChange() {
  if (assetHistory.length < 2) {
    return { absolute: 0, percent: 0, previous: assetHistory[assetHistory.length - 1]?.value || 0 };
  }
  const last = assetHistory[assetHistory.length - 1].value;
  const prev = assetHistory[assetHistory.length - 2].value;
  const absolute = last - prev;
  const percent = prev ? (absolute / prev) * 100 : 0;
  return { absolute, percent, previous: prev };
}

function normalizeType(type = '', symbol = '') {
  const t = (type || '').toLowerCase();
  const sym = (symbol || '').toUpperCase();
  if (t.includes('spot') || t.includes('現貨')) return 'spot';
  if (t.includes('swap') || t.includes('future') || t.includes('永續')) return 'future';
  if (t.includes('stable')) return 'stable';
  if (t.includes('earn') || t.includes('staking') || t.includes('defi')) return 'other';
  if (STABLE_TOKENS.includes(sym)) return 'stable';
  return 'spot';
}

function getSortedHistory() {
  return assetHistory
    .slice()
    .filter(entry => Number.isFinite(entry.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function estimateValueAt(sortedHistory, timestamp) {
  if (!sortedHistory.length) return 0;
  let prev = sortedHistory[0];
  let next = sortedHistory[sortedHistory.length - 1];
  for (let i = 0; i < sortedHistory.length; i++) {
    if (sortedHistory[i].timestamp <= timestamp) prev = sortedHistory[i];
    if (sortedHistory[i].timestamp >= timestamp) {
      next = sortedHistory[i];
      break;
    }
  }
  if (!prev && !next) return 0;
  if (!next || next.timestamp === prev.timestamp) return prev?.value ?? next?.value ?? 0;
  if (!prev) return next.value;
  const span = next.timestamp - prev.timestamp;
  if (span <= 0) return prev.value;
  const ratio = (timestamp - prev.timestamp) / span;
  return prev.value + (next.value - prev.value) * ratio;
}

function formatAxisLabel(timestamp, rangeKey) {
  const date = new Date(timestamp);
  if (rangeKey === 1) {
    return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
}

function formatTooltipLabel(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function buildChartSeries(rangeKey) {
  const config = RANGE_CONFIG[rangeKey] || RANGE_CONFIG[30];
  const sorted = getSortedHistory();
  if (!sorted.length) return [];
  const end = Date.now();
  const start = end - config.durationHours * HOUR;
  const step = Math.max(config.stepHours, 1) * HOUR;
  const series = [];
  const lookback = config.durationHours * HOUR;
  const minTs = end - lookback;
  for (let ts = minTs; ts <= end; ts += step) {
    const value = estimateValueAt(sorted, ts);
    series.push({
      timestamp: ts,
      value,
      axisLabel: formatAxisLabel(ts, rangeKey),
      tooltipLabel: formatTooltipLabel(ts)
    });
  }
  if (series.length < 2 && sorted.length >= 2) {
    const lastTwo = sorted.slice(-2);
    return lastTwo.map(entry => ({
      timestamp: entry.timestamp,
      value: entry.value,
      axisLabel: formatAxisLabel(entry.timestamp, rangeKey),
      tooltipLabel: formatTooltipLabel(entry.timestamp)
    }));
  }
  return series;
}

function buildPortfolioModel(snapshot = {}) {
  console.log('RUNNING: buildPortfolioModel');
  const aggregated = {};
  const typeTotals = { spot: 0, future: 0, stable: 0, other: 0 };
  let totalValue = 0;
  let totalDiff24h = 0;

  Object.entries(snapshot).forEach(([id, entry]) => {
    totalDiff24h += Number(entry?.diff24h) || 0;
    const list = Array.isArray(entry?.positions) ? entry.positions : [];
    list.forEach(pos => {
      const exchangeId = (pos.exchangeId || id || '').toLowerCase();
      const rawSymbol = (pos.symbol || pos.asset || '').trim();
      if (!rawSymbol) return;
      const symbol = rawSymbol.toUpperCase();
      if (exchangeId && symbol.toLowerCase() === exchangeId) return;
      const quantity = Number(pos.quantity ?? pos.amount ?? pos.free ?? 0);
      const price = Number(pos.lastPriceUSDT ?? pos.price ?? 0);
      if (!isFinite(quantity) || !isFinite(price)) return;
      if (quantity <= 0.0000001 || price <= 0) return;
      const value = quantity * price;
      if (value <= 0.0000001) return;
      const type = normalizeType(pos.type || entry.type, symbol);
      totalValue += value;
      typeTotals[type] = (typeTotals[type] || 0) + value;

      if (!aggregated[symbol]) {
        aggregated[symbol] = { symbol, quantity: 0, value: 0, type, price: 0 };
      }
      aggregated[symbol].quantity += quantity;
      aggregated[symbol].value += value;
      aggregated[symbol].type = aggregated[symbol].type || type;
      aggregated[symbol].price = aggregated[symbol].quantity
        ? aggregated[symbol].value / aggregated[symbol].quantity
        : price || aggregated[symbol].price;
    });
  });

  const aggregatedList = Object.values(aggregated).map(item => ({
    ...item,
    percent: totalValue ? (item.value / totalValue) * 100 : 0
  }));
  const validPositions = aggregatedList.filter(pos => pos.value > 0.0000001);

  return {
    positions: validPositions,
    aggregated,
    typeTotals,
    totalValue,
    diff24h: totalDiff24h,
    positionCount: aggregatedList.length
  };
}

function renderSummary(model, changeInfo) {
  console.log('RUNNING: renderSummary');
  const { totalValue } = model;
  const yesterdayValue = changeInfo.previous || 0;
  const changeAbsolute = changeInfo.absolute;
  const changePercent = changeInfo.percent;

  const totalEl = document.getElementById('total-usdt');
  const twdEl = document.getElementById('total-twd');
  const pnlEl = document.getElementById('today-pnl');
  const holdingsEl = document.getElementById('summary-holdings');
  const changeEl = document.getElementById('summary-24h');
  const changeRateEl = document.getElementById('summary-24h-rate');
  const yestEl = document.getElementById('summary-yesterday');
  const dateEl = document.getElementById('summary-date');

  totalEl && (totalEl.textContent = `${formatNumber(totalValue, 2)} USDT`);
  twdEl && (twdEl.textContent = `≈ ${formatNumber(totalValue * TWDRATE, 0)} TWD`);
  holdingsEl && (holdingsEl.textContent = `${formatNumber(totalValue, 2)} USDT`);

  const sign = changeAbsolute >= 0 ? '+' : '-';
  changeEl && (changeEl.textContent = `${sign}${formatNumber(Math.abs(changeAbsolute), 2)} USDT`);
  changeRateEl && (changeRateEl.textContent = `${sign}${Math.abs(changePercent).toFixed(2)}%`);
  yestEl && (yestEl.textContent = `${zhTW.yesterday}：${formatNumber(yesterdayValue, 2)} USDT`);
  pnlEl && (pnlEl.textContent = `${sign}${Math.abs(changePercent).toFixed(2)}%`);
  dateEl && (dateEl.textContent = new Date().toLocaleDateString('zh-TW'));
}

function renderDistribution(typeTotals, totalValue) {
  console.log('RUNNING: renderDistribution');
  const svg = document.getElementById('portfolio-pie');
  const legend = document.getElementById('portfolio-legend');
  const center = document.getElementById('pie-total');
  if (!svg || !legend || !center) return;

  svg.querySelectorAll('circle.slice').forEach(el => el.remove());
  const entries = Object.entries(typeTotals)
    .filter(([, value]) => value > 0)
    .map(([type, value]) => ({ type, value, percent: totalValue ? (value / totalValue) * 100 : 0 }));

  if (!entries.length) {
    center.textContent = '0';
    legend.innerHTML = `<div class="text-sm text-gray-400">${zhTW.noHoldings}</div>`;
    return;
  }

  const labels = {
    spot: '現貨倉位',
    future: '永續合約',
    stable: '穩定幣',
    other: '其他 / 被動收益'
  };
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  entries.forEach((entry, index) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '80');
    circle.setAttribute('cy', '80');
    circle.setAttribute('r', radius);
    circle.setAttribute('stroke', DISTRIBUTION_COLORS[index % DISTRIBUTION_COLORS.length]);
    circle.setAttribute('stroke-width', '18');
    circle.setAttribute('fill', 'none');
    circle.classList.add('slice');
    const dash = (entry.value / totalValue) * circumference;
    circle.setAttribute('stroke-dasharray', `${dash} ${circumference - dash}`);
    circle.setAttribute('stroke-dashoffset', -offset);
    offset += dash;
    svg.appendChild(circle);
  });

  center.textContent = formatNumber(totalValue, 0);
  legend.innerHTML = '';
  entries.forEach((entry, index) => {
    const row = document.createElement('li');
    row.innerHTML = `
      <div class="legend-left">
        <span class="legend-dot" style="background:${DISTRIBUTION_COLORS[index % DISTRIBUTION_COLORS.length]};"></span>
        <span>${labels[entry.type] || entry.type}</span>
      </div>
      <span>${Math.round(entry.percent)}%</span>
    `;
    legend.appendChild(row);
  });
}

function renderStats(model) {
  console.log('RUNNING: renderStats');
  const box = document.getElementById('portfolio-stats');
  if (!box) return;
  const positions = (model.positions || []).filter(item => item.value > 0);
  const symbols = new Set(positions.map(item => item.symbol));
  const top = positions.slice().sort((a, b) => b.value - a.value)[0];
  const stats = [
    { label: zhTW.holdingTypes, value: `${symbols.size} 種` },
    { label: zhTW.positions, value: `${positions.length} 筆` },
    { label: zhTW.largestHolding, value: top ? `${top.symbol} · ${formatNumber(top.value, 2)} USDT` : '-' }
  ];
  box.innerHTML = '';
  stats.forEach(stat => {
    const item = document.createElement('div');
    item.className = 'portfolio-stat-item';
    item.innerHTML = `
      <div class="portfolio-stat-label">${stat.label}</div>
      <div class="portfolio-stat-value">${stat.value}</div>
    `;
    box.appendChild(item);
  });
}

function renderHoldings(model) {
  console.log('RUNNING: renderHoldings');
  const tbody = document.getElementById('portfolio-holdings');
  if (!tbody) return;
  const positions = (model.positions || [])
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);
  tbody.innerHTML = '';
  if (!positions.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-gray-400 py-4">${zhTW.noHoldings}</td></tr>`;
    return;
  }
  positions.forEach(pos => {
    const percent = model.totalValue ? (pos.value / model.totalValue) * 100 : 0;
    tbody.innerHTML += `
      <tr>
        <td>${pos.symbol}</td>
        <td>${formatNumber(pos.quantity, 6)}</td>
        <td>${formatNumber(pos.price, 2)}</td>
        <td>${formatNumber(pos.value, 2)}</td>
        <td>${percent.toFixed(1)}%</td>
      </tr>
    `;
  });
}

function createSmoothPath(points) {
  if (!points.length) return '';
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
  }
  return d;
}

function showAssetTooltip(entry, x, y) {
  const tooltip = document.getElementById('asset-curve-tooltip');
  const container = document.querySelector('.asset-curve-body');
  if (!tooltip || !container) return;
  const width = container.clientWidth || CHART_WIDTH;
  const height = container.clientHeight || CHART_HEIGHT;
  const left = Math.min(width - 90, Math.max(16, (x / CHART_WIDTH) * width));
  const top = Math.min(height - 20, Math.max(20, (y / CHART_HEIGHT) * height));
  const label = entry.tooltipLabel || formatTooltipLabel(entry.timestamp);
  tooltip.textContent = `${label} · ${formatNumber(entry.value, 2)} USDT`;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top - 30}px`;
  tooltip.classList.remove('hidden');
}

function hideAssetTooltip() {
  document.getElementById('asset-curve-tooltip')?.classList.add('hidden');
}

function handleCurveHover(event) {
  if (!curveHoverCoords.length) return;
  const svg = document.getElementById('asset-trend');
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const ratioX = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
  const targetX = ratioX * CHART_WIDTH;
  let closest = curveHoverCoords[0];
  let minDiff = Math.abs(closest.x - targetX);
  for (let i = 1; i < curveHoverCoords.length; i++) {
    const diff = Math.abs(curveHoverCoords[i].x - targetX);
    if (diff < minDiff) {
      minDiff = diff;
      closest = curveHoverCoords[i];
    }
  }
  showAssetTooltip(closest.entry, closest.x, closest.y);
}

function handleCurveLeave() {
  hideAssetTooltip();
}

function bindCurveHover(coords) {
  curveHoverCoords = coords;
  const hitbox = document.getElementById('asset-curve-hit');
  if (!hitbox) return;
  hitbox.removeEventListener('mousemove', handleCurveHover);
  hitbox.removeEventListener('mouseleave', handleCurveLeave);
  if (!coords.length) {
    hitbox.style.pointerEvents = 'none';
    hideAssetTooltip();
    return;
  }
  hitbox.style.pointerEvents = 'all';
  hitbox.addEventListener('mousemove', handleCurveHover);
  hitbox.addEventListener('mouseleave', handleCurveLeave);
}

function renderAssetChart() {
  console.log('RUNNING: renderAssetChart');
  const path = document.getElementById('asset-trend-path');
  const svg = document.getElementById('asset-trend');
  const fillPath = document.getElementById('asset-trend-fill');
  const emptyState = document.getElementById('asset-curve-empty');
  const axisContainer = document.getElementById('asset-curve-axis');
  const minLabel = document.getElementById('curve-min');
  const maxLabel = document.getElementById('curve-max');
  if (!path || !svg) return;

  const showBaseline = (minValue = 0, maxValue = 0) => {
    path.setAttribute('d', `M 0 ${CHART_HEIGHT} L ${CHART_WIDTH} ${CHART_HEIGHT}`);
    fillPath?.setAttribute('d', `M 0 ${CHART_HEIGHT} L ${CHART_WIDTH} ${CHART_HEIGHT} L 0 ${CHART_HEIGHT} Z`);
    svg.querySelector('.grid-lines')?.replaceChildren();
    axisContainer && (axisContainer.innerHTML = '');
    minLabel && (minLabel.textContent = `${zhTW.lowest}：${formatNumber(minValue, 2)} USDT`);
    maxLabel && (maxLabel.textContent = `${zhTW.highest}：${formatNumber(maxValue, 2)} USDT`);
    bindCurveHover([]);
  };

  const entries = buildChartSeries(currentRange);
  if (!entries.length || entries.length < 2) {
    emptyState?.classList.remove('hidden');
    showBaseline(entries[0]?.value || 0, entries[entries.length - 1]?.value || 0);
    return;
  }
  emptyState?.classList.add('hidden');
  const totals = entries.map(entry => entry.value);
  const rawMin = Math.min(...totals);
  const max = Math.max(...totals);
  const nonZero = totals.filter(val => val > 0);
  const effectiveMin = nonZero.length ? Math.min(...nonZero) : rawMin;
  const range = max - effectiveMin;
  let pad = range * 0.12;
  if (!isFinite(pad) || pad < 1) {
    const baselinePad = Math.max(effectiveMin * 0.08, 8);
    pad = baselinePad || 8;
  }
  const paddedMin = Math.max(0, effectiveMin - pad);
  const paddedMax = max + pad;
  const paddedRange = Math.max(paddedMax - paddedMin, 1);
  const coords = entries.map((entry, idx) => {
    const x = (idx / Math.max(entries.length - 1, 1)) * CHART_WIDTH;
    const yBase = CHART_HEIGHT - ((entry.value - paddedMin) / paddedRange) * CHART_HEIGHT;
    const y = Math.min(CHART_HEIGHT - 2, Math.max(6, yBase + CHART_HEIGHT * 0.02));
    return { entry, x, y };
  });
  const smoothPath = createSmoothPath(coords);
  path.setAttribute('d', smoothPath);
  path.setAttribute('stroke', '#6AAEFF');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('fill', 'none');
  if (fillPath) {
    const first = coords[0];
    const last = coords[coords.length - 1];
    const fillD = `${smoothPath} L ${last.x.toFixed(2)} ${CHART_HEIGHT} L ${first.x.toFixed(2)} ${CHART_HEIGHT} Z`;
    fillPath.setAttribute('d', fillD);
  }

  const gridGroup = svg.querySelector('.grid-lines');
  if (gridGroup) {
    gridGroup.innerHTML = '';
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * CHART_HEIGHT;
      const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      lineEl.setAttribute('x1', '0');
      lineEl.setAttribute('x2', `${CHART_WIDTH}`);
      lineEl.setAttribute('y1', `${y}`);
      lineEl.setAttribute('y2', `${y}`);
      lineEl.setAttribute('stroke', 'rgba(0,0,0,0.02)');
      lineEl.setAttribute('stroke-width', '0.8');
      gridGroup.appendChild(lineEl);
    }
  }

  if (axisContainer) {
    axisContainer.innerHTML = '';
    const labelCount = Math.min(entries.length, 5);
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.min(entries.length - 1, Math.round((i * (entries.length - 1)) / Math.max(labelCount - 1, 1)));
      const label = document.createElement('span');
      label.textContent = entries[idx].axisLabel || formatAxisLabel(entries[idx].timestamp, currentRange);
      axisContainer.appendChild(label);
    }
  }

  minLabel && (minLabel.textContent = `${zhTW.lowest}：${formatNumber(rawMin, 2)} USDT`);
  maxLabel && (maxLabel.textContent = `${zhTW.highest}：${formatNumber(max, 2)} USDT`);
  bindCurveHover(coords);
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return zhTW.justNow;
  const delta = Date.now() - timestamp;
  if (delta < 60 * 1000) return zhTW.justNow;
  if (delta < 60 * 60 * 1000) return `${Math.round(delta / 60000)} 分鐘前`;
  if (delta < 24 * 60 * 60 * 1000) return `${Math.round(delta / (60 * 60 * 1000))} 小時前`;
  return new Date(timestamp).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
}

function renderExchangeCards(snapshot = {}) {
  console.log('RUNNING: renderExchangeCards');
  const wrap = document.getElementById('portfolio-exchange-cards');
  if (!wrap) return;
  wrap.innerHTML = '';
  const entries = Object.entries(snapshot);
  if (!entries.length) {
    wrap.innerHTML = `<div class="text-sm text-gray-400">${zhTW.noHoldings}</div>`;
    return;
  }
  entries
    .sort(([, a], [, b]) => (b.balance || 0) - (a.balance || 0))
    .forEach(([id, info]) => {
      const card = document.createElement('div');
      card.className = 'portfolio-exchange-card';
      const changeClass = (info.diff24h || 0) >= 0 ? 'text-positive' : 'text-negative';
      card.innerHTML = `
        <div class="card-head">${info.meta?.name || id}</div>
        <div class="card-row"><span>${zhTW.balance}</span><strong>${formatNumber(info.balance || 0, 2)} USDT</strong></div>
        <div class="card-row"><span>${zhTW.change24h}</span><strong class="${changeClass}">${info.diff24h >= 0 ? '+' : '-'}${formatNumber(Math.abs(info.diff24h || 0), 2)} USDT</strong></div>
        <div class="card-row"><span>${zhTW.updated}</span><strong class="text-muted">${formatRelativeTime(info.updatedAt)}</strong></div>
      `;
      wrap.appendChild(card);
    });
}

function applyRangeButtons() {
  console.log('RUNNING: applyRangeButtons');
  document.querySelectorAll('.asset-range-btn').forEach(btn => {
    const range = Number(btn.dataset.range);
    if (!range) return;
    btn.addEventListener('click', () => {
      currentRange = range;
      document.querySelectorAll('.asset-range-btn').forEach(other =>
        other.classList.toggle('active', Number(other.dataset.range) === range)
      );
      renderAssetChart();
    });
  });
  document.querySelector(`.asset-range-btn[data-range='${currentRange}']`)?.classList.add('active');
}

function handleBalanceUpdate(_, snapshot) {
  console.log('RUNNING: handleBalanceUpdate');
  balancesSnapshot = snapshot || {};
  const model = buildPortfolioModel(balancesSnapshot);
  const total = model.totalValue;
  updateAssetHistory(total);
  const change = computeChange();
  renderSummary(model, change);
  renderAssetChart();
  renderDistribution(model.typeTotals, model.totalValue);
  renderStats(model);
  renderHoldings(model);
}

function initPortfolioPage() {
  console.log('RUNNING: initPortfolioPage');
  assetHistory = loadHistory();
  balancesSnapshot = {};
  applyRangeButtons();
  applyTranslations();
  renderAssetChart();
  renderDistribution({ spot: 0, future: 0, stable: 0, other: 0 }, 0);
  renderStats({ positions: [], totalValue: 0 });
  renderHoldings({ positions: [], totalValue: 0 });
  renderExchangeCards({});
  onBalanceUpdate(handleBalanceUpdate);
  onExchangeUpdate(renderExchangeCards);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPortfolioPage);
} else {
  initPortfolioPage();
}
