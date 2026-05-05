/* ══════════════════════════════════════════════════════
   app.js — Orquestador principal
   Gestión de pestañas, estado global, inicialización
══════════════════════════════════════════════════════ */

'use strict';

// ══════════════════════════════════════════════════════
// GESTIÓN DE PESTAÑAS
// ══════════════════════════════════════════════════════

const TAB_RENDERERS = {
  import:      () => renderImportTab(),
  transform:   () => renderTransformTab(),
  consolidate: () => renderConsolidateTab(),
  sheets:      () => renderSheetsTab(),
  dashboard:   () => {},
};

let currentTab = 'dashboard';

function switchTab(tabName) {
  if (currentTab === tabName) return;
  currentTab = tabName;

  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.toggle('active', el.id === `tab-${tabName}`);
  });

  const showFilters = tabName === 'dashboard';
  ['yearFilterWrapper','monthFilterWrapper','exportCsvBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (showFilters && typeof allRows !== 'undefined' && allRows.length > 0) {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });

  const renderer = TAB_RENDERERS[tabName];
  if (renderer) renderer();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ══════════════════════════════════════════════════════
// BADGES EN NAV
// ══════════════════════════════════════════════════════

function updateNavBadges() {
  const defs = [
    { id: 'import',      getValue: () => typeof ImportState !== 'undefined' && ImportState.detectedSheets ? ImportState.detectedSheets.length : 0 },
    { id: 'transform',   getValue: () => typeof TransformState !== 'undefined' && TransformState.processedData ? TransformState.processedData.length : 0 },
    { id: 'consolidate', getValue: () => typeof ConsolidateState !== 'undefined' && ConsolidateState.finalDataset ? ConsolidateState.finalDataset.length : 0 },
    { id: 'sheets',      getValue: () => typeof DashboardState !== 'undefined' && DashboardState.dashboardData ? Object.keys(DashboardState.dashboardData).length : 0 },
  ];

  for (const { id, getValue } of defs) {
    const btn = document.querySelector(`.nav-tab[data-tab="${id}"]`);
    if (!btn) continue;
    const count = getValue();
    let badge = btn.querySelector('.nav-badge');
    if (count > 0) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'nav-badge'; btn.appendChild(badge); }
      badge.textContent = count > 9999 ? `${Math.round(count/1000)}k` : count;
    } else if (badge) {
      badge.remove();
    }
  }
}

// ══════════════════════════════════════════════════════
// OVERRIDE THEME TOGGLE — extend original to also update sheet charts
// ══════════════════════════════════════════════════════

// Store reference to original (defined in script.js which loads before app.js)
const _scriptToggleTheme = window.toggleTheme;

window.toggleTheme = function() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  document.getElementById('iconSun').classList.toggle('hidden', !isDark);
  document.getElementById('iconMoon').classList.toggle('hidden', isDark);

  if (typeof allRows !== 'undefined' && allRows.length > 0) {
    if (typeof renderBarChart === 'function') renderBarChart(filteredRows);
    if (typeof renderDonutChart === 'function') renderDonutChart(filteredRows);
    if (typeof renderTipoCharts === 'function') renderTipoCharts(filteredRows);
  }

  if (currentTab === 'sheets' && typeof DashboardState !== 'undefined' && DashboardState.activeSheet) {
    renderSheetDashboard(DashboardState.activeSheet);
  }
};

// ══════════════════════════════════════════════════════
// INICIALIZACIÓN
// ══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  updateNavBadges();
});
