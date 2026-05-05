/* ══════════════════════════════════════════════════════
   sheet-dashboards.js — ETAPA 4: Dashboards por Hoja
   Estado: dashboardData
   Genera automáticamente un dashboard visual por cada hoja
══════════════════════════════════════════════════════ */

'use strict';

// ─── ESTADO DE DASHBOARDS ──────────────────────────────
const DashboardState = {
  dashboardData: {},     // { [sheetName]: { records, kpis, charts } }
  activeSheet:   null,   // hoja activa en la UI
  chartInstances: {},    // Chart.js instances por hoja
  status: 'idle',
};

const MONTHS_ES_SH = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ══════════════════════════════════════════════════════
// RENDER — Tab de Dashboards
// ══════════════════════════════════════════════════════

function renderSheetsTab() {
  const app = document.getElementById('sheets-app');

  if (TransformState.status !== 'ready') {
    app.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
        </div>
        <h3>Sin datos para visualizar</h3>
        <p>Importa y transforma tu archivo primero.</p>
        <button class="btn btn-primary" onclick="switchTab('import')">Ir a Importar</button>
      </div>`;
    return;
  }

  buildDashboardData();
  const sheets = Object.keys(DashboardState.dashboardData);
  if (!DashboardState.activeSheet || !DashboardState.dashboardData[DashboardState.activeSheet]) {
    DashboardState.activeSheet = sheets[0];
  }

  // Destruir charts anteriores
  Object.values(DashboardState.chartInstances).forEach(c => { try { c.destroy(); } catch(_){} });
  DashboardState.chartInstances = {};

  app.innerHTML = `
    <div class="sheets-page">
      <div class="import-hero" style="margin-bottom:8px">
        <div class="import-badge" style="background:rgba(139,92,246,0.15);color:#a78bfa;border-color:rgba(139,92,246,0.3)">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          Etapa 4 — Dashboards por Hoja
        </div>
        <h2 class="import-title">Análisis por Cuenta</h2>
        <p class="import-subtitle">Dashboard automático para cada una de las ${sheets.length} cuentas detectadas.</p>
      </div>

      <!-- Selector de hojas -->
      <div class="sheets-nav" id="sheetsNav">
        ${sheets.map(name => {
          const { meta, kpis } = DashboardState.dashboardData[name];
          return `
            <button class="sheet-tab-btn ${name === DashboardState.activeSheet ? 'active' : ''}"
              onclick="switchSheetDashboard(${JSON.stringify(name)})"
              title="${escHtml(name)}">
              <div class="stb-top">
                <span class="stb-name">${escHtml(name)}</span>
                <span class="stag stag-moneda stag-${meta.moneda}">${meta.moneda}</span>
              </div>
              <div class="stb-bottom">
                <span class="stb-banco">${meta.banco}</span>
                <span class="stb-count">${kpis.total}</span>
              </div>
            </button>`;
        }).join('')}
      </div>

      <!-- Dashboard content area -->
      <div id="sheetDashboardContent"></div>
    </div>`;

  renderSheetDashboard(DashboardState.activeSheet);
}

// ══════════════════════════════════════════════════════
// CONSTRUIR DATOS POR HOJA
// ══════════════════════════════════════════════════════

function buildDashboardData() {
  DashboardState.dashboardData = {};
  const data = TransformState.processedData;
  if (!data) return;

  // Agrupar por hoja
  const bySheet = {};
  for (const r of data) {
    if (!bySheet[r.fuente_hoja]) bySheet[r.fuente_hoja] = [];
    bySheet[r.fuente_hoja].push(r);
  }

  for (const [sheetName, records] of Object.entries(bySheet)) {
    const meta = records[0] ? {
      banco:       records[0].banco,
      moneda:      records[0].moneda,
      tipo:        records[0].tipo_cuenta,
      institucion: records[0].institucion,
    } : {};

    const ingresos = records.filter(r => r.tipo === 'Ingreso');
    const egresos  = records.filter(r => r.tipo === 'Egreso');
    const totalIng = ingresos.reduce((s,r) => s + r.monto, 0);
    const totalEgr = egresos.reduce((s,r) => s + r.monto, 0);

    // KPIs
    const kpis = {
      totalIngresos: totalIng,
      totalEgresos:  totalEgr,
      balance:       totalIng - totalEgr,
      total:         records.length,
      countIng:      ingresos.length,
      countEgr:      egresos.length,
      tasa:          totalIng > 0 ? ((totalIng - totalEgr) / totalIng * 100) : 0,
      promedio:      records.length > 0 ? (totalIng + totalEgr) / records.length : 0,
    };

    // Datos para gráficas
    const byMonth = Array.from({length:12}, () => ({ing:0, egr:0}));
    const withDates = new Set();
    for (const r of records) {
      if (r.mes === null || r.mes === undefined) continue;
      byMonth[r.mes][r.tipo==='Ingreso'?'ing':'egr'] += r.monto;
      withDates.add(r.mes);
    }

    // Top tipos/descripciones
    const byDesc = {};
    for (const r of egresos) {
      const key = r.descripcion || 'Sin descripción';
      byDesc[key] = (byDesc[key] || 0) + r.monto;
    }
    const topDesc = Object.entries(byDesc).sort((a,b)=>b[1]-a[1]).slice(0,8);

    // Flujo en el tiempo (por fecha, todos los movimientos)
    const byFecha = {};
    for (const r of records) {
      if (!r.fecha) continue;
      const key = r.fecha_str;
      if (!byFecha[key]) byFecha[key] = { fecha: r.fecha, ing: 0, egr: 0 };
      if (r.tipo==='Ingreso') byFecha[key].ing += r.monto;
      else byFecha[key].egr += r.monto;
    }
    const timeline = Object.values(byFecha).sort((a,b) => a.fecha - b.fecha);

    DashboardState.dashboardData[sheetName] = {
      meta, records, kpis, byMonth, monthsWithData: [...withDates].sort((a,b)=>a-b),
      topDesc, timeline,
    };
  }

  DashboardState.status = 'ready';
}

// ══════════════════════════════════════════════════════
// RENDER DE UN DASHBOARD
// ══════════════════════════════════════════════════════

function switchSheetDashboard(name) {
  DashboardState.activeSheet = name;
  // Actualizar estado visual de los botones
  document.querySelectorAll('.sheet-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick').includes(JSON.stringify(name)));
  });
  // Destruir charts anteriores del contenido
  Object.entries(DashboardState.chartInstances).forEach(([id, inst]) => {
    try { inst.destroy(); } catch(_) {}
    delete DashboardState.chartInstances[id];
  });
  renderSheetDashboard(name);
}

function renderSheetDashboard(sheetName) {
  const container = document.getElementById('sheetDashboardContent');
  if (!container || !DashboardState.dashboardData[sheetName]) return;

  const { meta, kpis, byMonth, monthsWithData, topDesc, timeline, records } = DashboardState.dashboardData[sheetName];
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

  container.innerHTML = `
    <div class="sheet-dash">
      <!-- Dash header -->
      <div class="sheet-dash-header">
        <div>
          <h3 class="sheet-dash-title">${escHtml(sheetName)}</h3>
          <div class="sheet-dash-meta">
            <span class="stag stag-moneda stag-${meta.moneda}">${meta.moneda}</span>
            <span class="stag stag-tipo">${meta.tipo}</span>
            <span class="stag" style="background:rgba(99,102,241,0.15);color:#a78bfa">${meta.banco}</span>
            <span class="sheet-meta-count">${records.length.toLocaleString('es-MX')} movimientos</span>
          </div>
        </div>
      </div>

      <!-- KPIs -->
      <div class="sheet-kpi-grid">
        <div class="sheet-kpi income">
          <div class="sheet-kpi-label">Ingresos</div>
          <div class="sheet-kpi-value">${formatMoney(kpis.totalIngresos)}</div>
          <div class="sheet-kpi-sub">${kpis.countIng} mov.</div>
        </div>
        <div class="sheet-kpi expense">
          <div class="sheet-kpi-label">Egresos</div>
          <div class="sheet-kpi-value">${formatMoney(kpis.totalEgresos)}</div>
          <div class="sheet-kpi-sub">${kpis.countEgr} mov.</div>
        </div>
        <div class="sheet-kpi ${kpis.balance >= 0 ? 'balance-pos' : 'balance-neg'}">
          <div class="sheet-kpi-label">Balance</div>
          <div class="sheet-kpi-value">${formatMoney(kpis.balance)}</div>
          <div class="sheet-kpi-sub">${kpis.balance >= 0 ? '↑ Positivo' : '↓ Negativo'}</div>
        </div>
        <div class="sheet-kpi neutral">
          <div class="sheet-kpi-label">Tasa Ahorro</div>
          <div class="sheet-kpi-value">${kpis.tasa.toFixed(1)}%</div>
          <div class="sheet-kpi-sub">de ingresos</div>
        </div>
      </div>

      <!-- Charts -->
      <div class="sheet-charts-grid">
        <!-- Barras por mes -->
        <div class="chart-card">
          <div class="chart-header">
            <h3 class="chart-title">Ingresos vs Egresos por Mes</h3>
            <div class="chart-legend">
              <span class="legend-dot legend-income"></span><span>Ingresos</span>
              <span class="legend-dot legend-expense"></span><span>Egresos</span>
            </div>
          </div>
          <div class="chart-body" style="height:240px">
            <canvas id="sh-bar-${sanitizeId(sheetName)}"></canvas>
          </div>
        </div>

        <!-- Donut top descripciones -->
        <div class="chart-card">
          <div class="chart-header"><h3 class="chart-title">Top Movimientos por Descripción</h3></div>
          <div class="chart-body donut-body" style="height:280px">
            <canvas id="sh-donut-${sanitizeId(sheetName)}"></canvas>
          </div>
        </div>
      </div>

      <!-- Timeline si hay datos -->
      ${timeline.length > 1 ? `
      <div class="chart-card" style="margin-top:0">
        <div class="chart-header"><h3 class="chart-title">Flujo de Dinero en el Tiempo</h3></div>
        <div class="chart-body" style="height:200px">
          <canvas id="sh-line-${sanitizeId(sheetName)}"></canvas>
        </div>
      </div>` : ''}

      <!-- Tabla de transacciones -->
      <div class="table-card">
        <div class="table-header">
          <h3 class="chart-title">Transacciones</h3>
          <span class="table-badge">${records.length.toLocaleString('es-MX')} registros</span>
        </div>
        <div class="table-wrapper" style="max-height:400px;overflow-y:auto">
          <table class="data-table tx-enhanced-table">
            <thead>
              <tr>
                <th>Fecha</th><th>Descripción</th><th>Referencia</th>
                <th class="text-right">Monto</th><th>Tipo</th>
                ${records.some(r=>r.saldo) ? '<th class="text-right">Saldo</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${records.slice(0,100).map(r => `
                <tr>
                  <td class="td-date">${r.fecha_str}</td>
                  <td class="td-nombre">${escHtml(r.descripcion)}</td>
                  <td class="td-nombre">${escHtml(r.referencia||'—')}</td>
                  <td class="text-right td-total ${r.tipo==='Ingreso'?'td-total-inc':'td-total-egr'}">
                    ${r.tipo==='Ingreso'?'+':'-'}${formatMoney(r.monto)}
                  </td>
                  <td><span class="type-badge ${r.tipo==='Ingreso'?'type-income':'type-expense'}">${r.tipo}</span></td>
                  ${records.some(r2=>r2.saldo) ? `<td class="text-right td-num">${r.saldo ? formatMoney(r.saldo) : '—'}</td>` : ''}
                </tr>`).join('')}
              ${records.length > 100 ? `<tr><td colspan="6" class="tx-limit-note">Mostrando 100 de ${records.length.toLocaleString('es-MX')} registros</td></tr>` : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  // Renderizar gráficas después del DOM
  requestAnimationFrame(() => {
    renderSheetBarChart(sheetName, byMonth, monthsWithData, isDark);
    if (topDesc.length > 0) renderSheetDonutChart(sheetName, topDesc, isDark);
    if (timeline.length > 1) renderSheetLineChart(sheetName, timeline, isDark);
  });
}

// ══════════════════════════════════════════════════════
// GRÁFICAS POR HOJA
// ══════════════════════════════════════════════════════

const PALETTE_SH = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#f59e0b','#10b981','#14b8a6'];

function renderSheetBarChart(sheetName, byMonth, monthsWithData, isDark) {
  const canvasId = `sh-bar-${sanitizeId(sheetName)}`;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const labels  = monthsWithData.map(m => MONTHS_ES_SH[m]);
  const ingData = monthsWithData.map(m => byMonth[m].ing);
  const egrData = monthsWithData.map(m => byMonth[m].egr);

  const grid = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const tick = isDark ? '#64748b' : '#94a3b8';

  const inst = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Ingresos', data:ingData, backgroundColor:'rgba(16,185,129,0.75)', borderRadius:5, borderSkipped:false },
        { label:'Egresos',  data:egrData, backgroundColor:'rgba(244,63,94,0.75)',  borderRadius:5, borderSkipped:false },
      ],
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:false},tooltip:shTooltipDefaults(isDark)},
      scales:{
        x:{grid:{display:false},ticks:{color:tick,font:{family:'Inter',size:11}}},
        y:{grid:{color:grid},border:{display:false},ticks:{color:tick,font:{family:'Inter',size:11},callback:v=>formatMoneyShort(v)}},
      },
    },
  });
  DashboardState.chartInstances[canvasId] = inst;
}

function renderSheetDonutChart(sheetName, topDesc, isDark) {
  const canvasId = `sh-donut-${sanitizeId(sheetName)}`;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const total = topDesc.reduce((s,[,v]) => s+v, 0);
  const lblColor = isDark ? '#94a3b8' : '#475569';

  const inst = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: topDesc.map(([t]) => t.slice(0,30) + (t.length>30?'…':'')),
      datasets: [{
        data: topDesc.map(([,v]) => v),
        backgroundColor: PALETTE_SH.map((c,i) => PALETTE_SH[i % PALETTE_SH.length]),
        borderColor: isDark ? '#1e293b' : '#f8fafc',
        borderWidth: 2,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive:true, maintainAspectRatio:false, cutout:'62%',
      layout:{padding:{top:4,bottom:4}},
      plugins:{
        legend:{
          position:'bottom',align:'center',
          labels:{color:lblColor,font:{family:'Inter',size:10,weight:'500'},padding:12,boxWidth:8,usePointStyle:true},
        },
        tooltip:{
          backgroundColor:isDark?'#1e293b':'#fff',
          titleColor:isDark?'#f1f5f9':'#0f172a',
          bodyColor:isDark?'#94a3b8':'#475569',
          borderColor:isDark?'rgba(255,255,255,0.12)':'rgba(0,0,0,0.08)',
          borderWidth:1,padding:10,cornerRadius:8,
          callbacks:{label:ctx=>{
            const v=ctx.dataset.data[ctx.dataIndex];
            const pct=total>0?(v/total*100).toFixed(1):'0';
            return ` ${formatMoney(v)} (${pct}%)`;
          }},
        },
      },
    },
  });
  DashboardState.chartInstances[canvasId] = inst;
}

function renderSheetLineChart(sheetName, timeline, isDark) {
  const canvasId = `sh-line-${sanitizeId(sheetName)}`;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Agrupar por mes/año para simplificar
  const grouped = {};
  for (const pt of timeline) {
    const key = `${pt.fecha.getFullYear()}-${String(pt.fecha.getMonth()+1).padStart(2,'0')}`;
    if (!grouped[key]) grouped[key] = { ing: 0, egr: 0 };
    grouped[key].ing += pt.ing;
    grouped[key].egr += pt.egr;
  }
  const keys   = Object.keys(grouped).sort();
  const labels = keys.map(k => {
    const [yr,mo] = k.split('-');
    return `${MONTHS_ES_SH[+mo-1]} ${yr}`;
  });
  const ingData = keys.map(k => grouped[k].ing);
  const egrData = keys.map(k => grouped[k].egr);

  const grid = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const tick = isDark ? '#64748b' : '#94a3b8';

  const inst = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label:'Ingresos', data:ingData,
          borderColor:'rgba(16,185,129,0.9)', backgroundColor:'rgba(16,185,129,0.08)',
          borderWidth:2, pointRadius:3, fill:true, tension:0.3,
        },
        {
          label:'Egresos', data:egrData,
          borderColor:'rgba(244,63,94,0.9)', backgroundColor:'rgba(244,63,94,0.08)',
          borderWidth:2, pointRadius:3, fill:true, tension:0.3,
        },
      ],
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:false},tooltip:shTooltipDefaults(isDark)},
      scales:{
        x:{grid:{display:false},ticks:{color:tick,font:{family:'Inter',size:10},maxRotation:45}},
        y:{grid:{color:grid},border:{display:false},ticks:{color:tick,font:{family:'Inter',size:10},callback:v=>formatMoneyShort(v)}},
      },
    },
  });
  DashboardState.chartInstances[canvasId] = inst;
}

function shTooltipDefaults(isDark) {
  return {
    backgroundColor:isDark?'#1e293b':'#fff',
    titleColor:isDark?'#f1f5f9':'#0f172a',
    bodyColor:isDark?'#94a3b8':'#475569',
    borderColor:isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)',
    borderWidth:1, padding:10, cornerRadius:8,
    callbacks:{label:ctx=>` ${ctx.dataset.label||''}: ${formatMoney(ctx.dataset.data[ctx.dataIndex])}`},
  };
}

function sanitizeId(str) {
  return str.replace(/[^a-zA-Z0-9]/g, '_');
}

function onSheetDashboardsAvailable() {
  DashboardState.status = 'idle';
}
