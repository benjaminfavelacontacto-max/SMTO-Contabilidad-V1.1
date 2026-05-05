/* ══════════════════════════════════════════════════════
   consolidator.js — ETAPA 3: Consolidación y Exportación Excel
   Estado: finalDataset
   Combina todos los datos transformados → Excel final
══════════════════════════════════════════════════════ */

'use strict';

// ─── ESTADO FINAL ─────────────────────────────────────
const ConsolidateState = {
  finalDataset: null,    // datos consolidados listos para exportar
  summary: null,         // resumen financiero
  status: 'idle',        // idle | ready
};

// ══════════════════════════════════════════════════════
// RENDER — Tab de Consolidación
// ══════════════════════════════════════════════════════

function renderConsolidateTab() {
  const app = document.getElementById('consolidate-app');

  if (TransformState.status !== 'ready') {
    app.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
        </div>
        <h3>Sin datos transformados</h3>
        <p>Primero ejecuta la <strong>Transformación</strong> en la pestaña anterior.</p>
        <button class="btn btn-primary" onclick="switchTab('transform')">Ir a Transformar</button>
      </div>`;
    return;
  }

  buildFinalDataset();
  const { summary, finalDataset } = ConsolidateState;

  app.innerHTML = `
    <div class="consolidate-page">
      <div class="import-hero">
        <div class="import-badge" style="background:rgba(245,158,11,0.15);color:#fbbf24;border-color:rgba(245,158,11,0.3)">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
          Etapa 3 — Consolidación Final
        </div>
        <h2 class="import-title">Concentrado Financiero</h2>
        <p class="import-subtitle">${finalDataset.length.toLocaleString('es-MX')} movimientos de ${Object.keys(summary.byBanco).length} instituciones consolidados en un solo dataset.</p>
      </div>

      <!-- KPIs principales -->
      <div class="cons-kpi-grid">
        <div class="cons-kpi income">
          <div class="cons-kpi-label">Total Ingresos</div>
          <div class="cons-kpi-value">${formatMoney(summary.totalIngresos)}</div>
          <div class="cons-kpi-sub">${summary.countIngresos.toLocaleString('es-MX')} movimientos</div>
        </div>
        <div class="cons-kpi expense">
          <div class="cons-kpi-label">Total Egresos</div>
          <div class="cons-kpi-value">${formatMoney(summary.totalEgresos)}</div>
          <div class="cons-kpi-sub">${summary.countEgresos.toLocaleString('es-MX')} movimientos</div>
        </div>
        <div class="cons-kpi balance ${summary.balance >= 0 ? 'pos' : 'neg'}">
          <div class="cons-kpi-label">Balance</div>
          <div class="cons-kpi-value">${formatMoney(summary.balance)}</div>
          <div class="cons-kpi-sub">${summary.balance >= 0 ? '✓ Positivo' : '⚠ Negativo'}</div>
        </div>
        <div class="cons-kpi neutral">
          <div class="cons-kpi-label">Total Movimientos</div>
          <div class="cons-kpi-value">${finalDataset.length.toLocaleString('es-MX')}</div>
          <div class="cons-kpi-sub">${Object.keys(summary.byBanco).length} instituciones</div>
        </div>
      </div>

      <!-- Desglose por institución -->
      <div class="cons-breakdown-grid">
        <div class="cons-breakdown-card">
          <h4>Por Institución</h4>
          ${Object.entries(summary.byBanco)
            .sort((a,b) => (b[1].ingresos + b[1].egresos) - (a[1].ingresos + a[1].egresos))
            .map(([banco, data]) => `
            <div class="cons-bd-row">
              <span class="cons-bd-name">${banco}</span>
              <div class="cons-bd-amounts">
                <span class="cons-bd-ing">+${formatMoneyShort(data.ingresos)}</span>
                <span class="cons-bd-egr">-${formatMoneyShort(data.egresos)}</span>
                <span class="cons-bd-bal ${data.balance >= 0 ? 'pos' : 'neg'}">${formatMoneyShort(data.balance)}</span>
              </div>
            </div>`).join('')}
        </div>

        <div class="cons-breakdown-card">
          <h4>Por Moneda</h4>
          ${Object.entries(summary.byMoneda).map(([moneda, data]) => `
            <div class="cons-bd-row">
              <span class="stag stag-moneda stag-${moneda}">${moneda}</span>
              <div class="cons-bd-amounts">
                <span class="cons-bd-ing">+${formatMoneyShort(data.ingresos)}</span>
                <span class="cons-bd-egr">-${formatMoneyShort(data.egresos)}</span>
                <span class="cons-bd-bal ${data.balance >= 0 ? 'pos' : 'neg'}">${formatMoneyShort(data.balance)}</span>
              </div>
            </div>`).join('')}
        </div>

        <div class="cons-breakdown-card">
          <h4>Por Tipo de Cuenta</h4>
          ${Object.entries(summary.byTipoCuenta)
            .sort((a,b) => (b[1].ingresos + b[1].egresos) - (a[1].ingresos + a[1].egresos))
            .map(([tipo, data]) => `
            <div class="cons-bd-row">
              <span class="cons-bd-name">${tipo}</span>
              <div class="cons-bd-amounts">
                <span class="cons-bd-ing">+${formatMoneyShort(data.ingresos)}</span>
                <span class="cons-bd-egr">-${formatMoneyShort(data.egresos)}</span>
              </div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Estructura del Excel a exportar -->
      <div class="excel-structure-card">
        <h4>
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
          Estructura del Excel Final
        </h4>
        <div class="excel-sheets-list">
          <div class="excel-sheet-item">
            <div class="excel-sheet-icon concentrado">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <div>
              <strong>Concentrado</strong>
              <span>${finalDataset.length.toLocaleString('es-MX')} movimientos unificados · Todas las columnas estándar</span>
            </div>
          </div>
          ${Object.keys(summary.byBanco).map(banco => `
          <div class="excel-sheet-item">
            <div class="excel-sheet-icon banco">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            </div>
            <div>
              <strong>${banco}</strong>
              <span>${(summary.byBanco[banco].count||0).toLocaleString('es-MX')} movimientos</span>
            </div>
          </div>`).join('')}
          ${Object.keys(summary.byMoneda).map(moneda => `
          <div class="excel-sheet-item">
            <div class="excel-sheet-icon moneda">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <div>
              <strong>Moneda ${moneda}</strong>
              <span>${(summary.byMoneda[moneda].count||0).toLocaleString('es-MX')} movimientos</span>
            </div>
          </div>`).join('')}
          <div class="excel-sheet-item">
            <div class="excel-sheet-icon resumen">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <div>
              <strong>Resumen</strong>
              <span>KPIs · Totales por banco · Balance por moneda</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Botón de exportar -->
      <div class="export-action">
        <button class="btn btn-export" onclick="exportConsolidatedExcel()">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Exportar Excel Consolidado
          <span class="btn-export-sub">.xlsx · ${Object.keys(summary.byBanco).length + Object.keys(summary.byMoneda).length + 2} hojas</span>
        </button>
        <p class="export-hint">Descarga el archivo con todos los movimientos organizados por institución y moneda</p>
      </div>

      <!-- Preview de primeras filas -->
      <div class="cons-preview">
        <h4>Vista Previa — Hoja Concentrado (primeras 10 filas)</h4>
        <div class="table-wrapper">
          <table class="data-table cons-preview-table">
            <thead>
              <tr>
                <th>Fecha</th><th>Descripción</th><th>Monto</th><th>Tipo</th>
                <th>Banco</th><th>Cuenta</th><th>Moneda</th><th>Referencia</th>
              </tr>
            </thead>
            <tbody>
              ${finalDataset.slice(0,10).map(r => `
                <tr>
                  <td class="td-date">${r.fecha_str}</td>
                  <td class="td-nombre">${escHtml(r.descripcion)}</td>
                  <td class="text-right td-num">${formatMoney(r.monto)}</td>
                  <td><span class="type-badge ${r.tipo==='Ingreso'?'type-income':'type-expense'}">${r.tipo}</span></td>
                  <td>${escHtml(r.banco)}</td>
                  <td>${escHtml(r.tipo_cuenta)}</td>
                  <td><span class="stag stag-moneda stag-${r.moneda}">${r.moneda}</span></td>
                  <td class="td-nombre">${escHtml(r.referencia||'—')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════
// CONSTRUIR DATASET FINAL
// ══════════════════════════════════════════════════════

function buildFinalDataset() {
  const data = TransformState.processedData;
  if (!data) return;

  ConsolidateState.finalDataset = data;

  // Calcular resumen
  const summary = {
    totalIngresos: 0, totalEgresos: 0, balance: 0,
    countIngresos: 0, countEgresos: 0,
    byBanco: {}, byMoneda: {}, byTipoCuenta: {},
  };

  for (const r of data) {
    const isIng = r.tipo === 'Ingreso';
    if (isIng) { summary.totalIngresos += r.monto; summary.countIngresos++; }
    else        { summary.totalEgresos += r.monto; summary.countEgresos++; }

    // Por banco
    if (!summary.byBanco[r.banco]) summary.byBanco[r.banco] = {ingresos:0,egresos:0,balance:0,count:0};
    summary.byBanco[r.banco].count++;
    if (isIng) summary.byBanco[r.banco].ingresos += r.monto;
    else       summary.byBanco[r.banco].egresos  += r.monto;
    summary.byBanco[r.banco].balance = summary.byBanco[r.banco].ingresos - summary.byBanco[r.banco].egresos;

    // Por moneda
    if (!summary.byMoneda[r.moneda]) summary.byMoneda[r.moneda] = {ingresos:0,egresos:0,balance:0,count:0};
    summary.byMoneda[r.moneda].count++;
    if (isIng) summary.byMoneda[r.moneda].ingresos += r.monto;
    else       summary.byMoneda[r.moneda].egresos  += r.monto;
    summary.byMoneda[r.moneda].balance = summary.byMoneda[r.moneda].ingresos - summary.byMoneda[r.moneda].egresos;

    // Por tipo de cuenta
    if (!summary.byTipoCuenta[r.tipo_cuenta]) summary.byTipoCuenta[r.tipo_cuenta] = {ingresos:0,egresos:0,count:0};
    summary.byTipoCuenta[r.tipo_cuenta].count++;
    if (isIng) summary.byTipoCuenta[r.tipo_cuenta].ingresos += r.monto;
    else       summary.byTipoCuenta[r.tipo_cuenta].egresos  += r.monto;
  }

  summary.balance = summary.totalIngresos - summary.totalEgresos;
  ConsolidateState.summary = summary;
  ConsolidateState.status = 'ready';
}

// ══════════════════════════════════════════════════════
// EXPORTAR EXCEL
// ══════════════════════════════════════════════════════

function exportConsolidatedExcel() {
  if (!ConsolidateState.finalDataset) return;

  const wb = XLSX.utils.book_new();
  const data = ConsolidateState.finalDataset;
  const summary = ConsolidateState.summary;

  // ── Hoja 1: CONCENTRADO ──
  const concentradoData = data.map(r => ({
    'Fecha':           r.fecha_str,
    'Descripcion':     r.descripcion,
    'Monto':           r.monto,
    'Tipo':            r.tipo,
    'Banco':           r.banco,
    'Cuenta / Hoja':   r.fuente_hoja,
    'Tipo de Cuenta':  r.tipo_cuenta,
    'Moneda':          r.moneda,
    'Referencia':      r.referencia || '',
    'Saldo':           r.saldo || '',
    'Institucion':     r.institucion,
  }));
  const wsConcentrado = XLSX.utils.json_to_sheet(concentradoData);
  setColWidths(wsConcentrado, [14,35,14,10,12,22,15,8,18,14,16]);
  XLSX.utils.book_append_sheet(wb, wsConcentrado, 'Concentrado');

  // ── Hojas por Banco ──
  const bancos = [...new Set(data.map(r => r.banco))].sort();
  for (const banco of bancos) {
    const rows = data.filter(r => r.banco === banco);
    const sheetData = rows.map(r => ({
      'Fecha':       r.fecha_str,
      'Descripcion': r.descripcion,
      'Monto':       r.monto,
      'Tipo':        r.tipo,
      'Cuenta':      r.fuente_hoja,
      'Moneda':      r.moneda,
      'Referencia':  r.referencia || '',
      'Saldo':       r.saldo || '',
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    setColWidths(ws, [14,35,14,10,22,8,18,14]);
    // Nombre de hoja: máx 31 chars, sin chars especiales
    const safeName = banco.replace(/[\/\\?*\[\]]/g,'').slice(0,31);
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }

  // ── Hojas por Moneda ──
  const monedas = [...new Set(data.map(r => r.moneda))].sort();
  for (const moneda of monedas) {
    const rows = data.filter(r => r.moneda === moneda);
    const sheetData = rows.map(r => ({
      'Fecha':       r.fecha_str,
      'Descripcion': r.descripcion,
      'Monto':       r.monto,
      'Tipo':        r.tipo,
      'Banco':       r.banco,
      'Cuenta':      r.fuente_hoja,
      'Referencia':  r.referencia || '',
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    setColWidths(ws, [14,35,14,10,12,22,18]);
    XLSX.utils.book_append_sheet(wb, ws, `Moneda ${moneda}`);
  }

  // ── Hoja RESUMEN ──
  const resumenRows = [
    ['RESUMEN FINANCIERO CONSOLIDADO'],
    ['Generado:', new Date().toLocaleString('es-MX')],
    [''],
    ['TOTALES GENERALES'],
    ['Total Ingresos', summary.totalIngresos],
    ['Total Egresos', summary.totalEgresos],
    ['Balance Neto', summary.balance],
    ['Total Movimientos', data.length],
    [''],
    ['DESGLOSE POR INSTITUCIÓN'],
    ['Institución', 'Ingresos', 'Egresos', 'Balance', 'Movimientos'],
    ...Object.entries(summary.byBanco).sort((a,b)=>(b[1].ingresos+b[1].egresos)-(a[1].ingresos+a[1].egresos))
      .map(([b,d]) => [b, d.ingresos, d.egresos, d.balance, d.count]),
    [''],
    ['DESGLOSE POR MONEDA'],
    ['Moneda', 'Ingresos', 'Egresos', 'Balance', 'Movimientos'],
    ...Object.entries(summary.byMoneda).map(([m,d]) => [m, d.ingresos, d.egresos, d.balance, d.count]),
    [''],
    ['DESGLOSE POR TIPO DE CUENTA'],
    ['Tipo', 'Ingresos', 'Egresos', 'Movimientos'],
    ...Object.entries(summary.byTipoCuenta).sort((a,b)=>b[1].count-a[1].count)
      .map(([t,d]) => [t, d.ingresos, d.egresos, d.count]),
  ];
  const wsResumen = XLSX.utils.aoa_to_sheet(resumenRows);
  setColWidths(wsResumen, [28,16,16,16,14]);
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  // ── Descargar ──
  const filename = `Concentrado_Financiero_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, filename);
}

function setColWidths(ws, widths) {
  ws['!cols'] = widths.map(w => ({ wch: w }));
}

function onTransformComplete() {
  if (ConsolidateState.status === 'ready') {
    ConsolidateState.status = 'idle';
  }
}
