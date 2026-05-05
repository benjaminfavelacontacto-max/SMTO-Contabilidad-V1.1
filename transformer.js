/* ══════════════════════════════════════════════════════
   transformer.js — ETAPA 2: Normalización y Transformación
   Estado: processedData
   Convierte hojas heterogéneas → formato estándar unificado
══════════════════════════════════════════════════════ */

'use strict';

// ─── ESTADO DE TRANSFORMACIÓN ──────────────────────────
const TransformState = {
  processedData: null,    // Array de registros normalizados
  mappingLog: [],         // Log de decisiones de mapeo
  stats: null,            // Estadísticas del proceso
  status: 'idle',         // idle | processing | ready | error
};

// ─── ESQUEMA ESTÁNDAR DE SALIDA ────────────────────────
// Cada registro normalizado tiene estos campos:
const STANDARD_SCHEMA = {
  id:          '',    // uuid interno
  fecha:       null,  // Date
  fecha_str:   '',    // "DD/MMM/YYYY"
  descripcion: '',    // texto de la transacción
  monto:       0,     // valor absoluto
  tipo:        '',    // "Ingreso" | "Egreso"
  cuenta:      '',    // nombre de la hoja/cuenta de origen
  moneda:      '',    // "MXN" | "USD"
  banco:       '',    // "BBVA" | "Monex" | ...
  tipo_cuenta: '',    // "Cheques" | "Crédito" | ...
  institucion: '',    // nombre completo institución
  referencia:  '',    // referencia o número de operación
  concepto:    '',    // concepto adicional
  saldo:       0,     // saldo si está disponible
  fuente_hoja: '',    // nombre de la hoja original
  raw:         {},    // fila original para auditoría
};

// ══════════════════════════════════════════════════════
// DETECTORES DE COLUMNAS — Sistema dinámico
// Cada banco puede tener nombres distintos → aliases
// ══════════════════════════════════════════════════════

const COLUMN_DETECTORS = {
  fecha: {
    aliases: ['fecha','date','fecha operacion','fecha de operacion','fecha valor',
              'fecha mov','fecha movimiento','transaction date','fecha de transaccion',
              'fecha pago','posting date','fecha contable','fecha aplicacion'],
    required: true,
  },
  descripcion: {
    aliases: ['descripcion','descripción','concepto','referencia','detalle',
              'description','movimiento','nombre','beneficiario','comercio',
              'narrative','memo','leyenda','cargo a','tipo de cargo'],
    required: false,
  },
  monto_cargo: {
    aliases: ['cargo','cargos','débito','debito','retiro','retiros','egreso',
              'egresos','debit','salida','salidas','importe cargo','monto cargo'],
    required: false,
  },
  monto_abono: {
    aliases: ['abono','abonos','crédito','credito','deposito','depósito','ingreso',
              'ingresos','credit','entrada','entradas','importe abono','monto abono'],
    required: false,
  },
  monto_total: {
    aliases: ['importe','monto','total','amount','valor','suma','cantidad'],
    required: false,
  },
  saldo: {
    aliases: ['saldo','balance','saldo final','saldo disponible','saldo actual',
              'running balance','saldo contable'],
    required: false,
  },
  referencia: {
    aliases: ['referencia','ref','no. operacion','numero operacion','folio',
              'numero de referencia','clave de rastreo','clabe','num transaccion',
              'transaction id','id transaccion','cheque','no cheque'],
    required: false,
  },
  tipo_mov: {
    aliases: ['tipo','tipo movimiento','tipo de movimiento','tipo de operacion',
              'naturaleza','clase','d/c','db/cr','debe/haber'],
    required: false,
  },
};

/** Detecta el índice de columna en los headers de una hoja. */
function detectColumn(headers, detector) {
  const hdrsLow = headers.map(h => h.toLowerCase().trim());
  for (const alias of detector.aliases) {
    const idx = hdrsLow.findIndex(h => h === alias || h.includes(alias));
    if (idx !== -1) return { idx, matched: headers[idx], alias };
  }
  return null;
}

/** Mapea los headers de una hoja al esquema estándar. */
function buildColumnMap(headers, sheetName) {
  const map = {};
  const log = [];
  for (const [field, detector] of Object.entries(COLUMN_DETECTORS)) {
    const result = detectColumn(headers, detector);
    if (result) {
      map[field] = result.idx;
      log.push({ field, found: result.matched, alias: result.alias });
    } else if (detector.required) {
      log.push({ field, found: null, error: `Columna "${field}" no encontrada en "${sheetName}"` });
    }
  }
  return { map, log };
}

// ══════════════════════════════════════════════════════
// MOTOR DE TRANSFORMACIÓN
// ══════════════════════════════════════════════════════

let _idCounter = 0;
function genId() { return `tx_${Date.now()}_${++_idCounter}`; }

/** Transforma UNA hoja a registros normalizados. */
function transformSheet(sheetName, sheetData) {
  const { meta, headers, rows } = sheetData;
  const { map, log } = buildColumnMap(headers, sheetName);

  const records = [];
  let skipped = 0;

  for (const rawRow of rows) {
    try {
      // Obtener valor crudo de la fila
      const getVal = (field) => {
        if (map[field] === undefined) return '';
        const key = headers[map[field]];
        return String(rawRow[key] || '').trim();
      };

      // ── Fecha ──
      const rawFecha = getVal('fecha');
      const fecha = importParseDate(rawFecha);
      if (!fecha && !rawFecha) { skipped++; continue; }

      // ── Montos ──
      let monto = 0;
      let tipo = '';

      const rawCargo = getVal('monto_cargo');
      const rawAbono = getVal('monto_abono');
      const rawTotal = getVal('monto_total');
      const rawTipoMov = getVal('tipo_mov');

      if (rawCargo && parseMonto(rawCargo) > 0) {
        monto = parseMonto(rawCargo);
        tipo = 'Egreso';
      } else if (rawAbono && parseMonto(rawAbono) > 0) {
        monto = parseMonto(rawAbono);
        tipo = 'Ingreso';
      } else if (rawTotal) {
        const v = parseMonto(rawTotal);
        if (!isNaN(v) && v !== 0) {
          monto = Math.abs(v);
          // Inferir tipo por signo o por campo tipo_mov
          tipo = inferTipo(v, rawTipoMov);
        }
      }

      if (monto === 0 || isNaN(monto)) { skipped++; continue; }

      // ── Descripción ──
      const descripcion = getVal('descripcion') || getVal('referencia') || '—';

      // ── Saldo ──
      const saldoRaw = getVal('saldo');
      const saldo = saldoRaw ? (parseMonto(saldoRaw) || 0) : 0;

      // ── Referencia ──
      const referencia = getVal('referencia') || '';

      // ── Construir registro normalizado ──
      records.push({
        id:          genId(),
        fecha,
        fecha_str:   fecha ? formatFechaStr(fecha) : rawFecha || 'Sin fecha',
        year:        fecha ? fecha.getFullYear() : 'Sin fecha',
        mes:         fecha ? fecha.getMonth() : null,
        descripcion: capitalizar(descripcion),
        monto,
        tipo,
        cuenta:      sheetName,
        moneda:      meta.moneda,
        banco:       meta.banco,
        tipo_cuenta: meta.tipo,
        institucion: meta.institucion,
        referencia,
        concepto:    descripcion,
        saldo,
        fuente_hoja: sheetName,
        raw:         rawRow,
      });
    } catch(_) { skipped++; }
  }

  return { records, skipped, log, meta };
}

/** Infiere si es Ingreso/Egreso desde el signo y texto del tipo. */
function inferTipo(monto, tipoStr) {
  if (tipoStr) {
    const t = tipoStr.toLowerCase();
    if (t.includes('cargo') || t.includes('deb') || t.includes('sal') ||
        t === 'd' || t === 'db' || t === '-') return 'Egreso';
    if (t.includes('abono') || t.includes('cred') || t.includes('dep') ||
        t === 'c' || t === 'cr' || t === '+') return 'Ingreso';
  }
  return monto >= 0 ? 'Ingreso' : 'Egreso';
}

// ══════════════════════════════════════════════════════
// RENDER — Tab de Transformación
// ══════════════════════════════════════════════════════

function renderTransformTab() {
  const app = document.getElementById('transform-app');

  if (ImportState.status !== 'ready') {
    app.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </div>
        <h3>Sin datos para transformar</h3>
        <p>Primero importa un archivo en la pestaña <strong>Importar</strong>.</p>
        <button class="btn btn-primary" onclick="switchTab('import')">Ir a Importar</button>
      </div>`;
    return;
  }

  const { sheets } = ImportState.rawDataFile2;
  const totalSheets = Object.keys(sheets).length;
  const totalRows = Object.values(sheets).reduce((s,sh) => s + sh.rowCount, 0);

  app.innerHTML = `
    <div class="transform-page">
      <div class="import-hero">
        <div class="import-badge" style="background:rgba(16,185,129,0.15);color:#34d399;border-color:rgba(16,185,129,0.3)">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          Etapa 2 — Normalización
        </div>
        <h2 class="import-title">Transformación y Estandarización</h2>
        <p class="import-subtitle">${totalSheets} hojas detectadas con ${totalRows.toLocaleString('es-MX')} registros crudos. La transformación normaliza cada hoja al esquema estándar unificado.</p>
      </div>

      <!-- Esquema de salida -->
      <div class="schema-card">
        <h4 class="schema-title">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
          Esquema Estándar de Salida
        </h4>
        <div class="schema-fields">
          ${['fecha','descripcion','monto','tipo','cuenta','moneda','banco','tipo_cuenta','referencia','saldo'].map(f => `
            <div class="schema-field">
              <span class="schema-field-name">${f}</span>
              <span class="schema-field-type">${getFieldType(f)}</span>
            </div>`).join('')}
        </div>
      </div>

      <!-- Preview de mapeo por hoja -->
      <h3 class="section-title">Mapeo de Columnas por Hoja</h3>
      <div class="mapping-grid">
        ${Object.entries(sheets).map(([name, sh]) => renderMappingCard(name, sh)).join('')}
      </div>

      <!-- Botón de transformar -->
      <div class="transform-action">
        ${TransformState.status === 'ready'
          ? `<div class="transform-done-banner">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              Transformación completada: <strong>${TransformState.processedData.length.toLocaleString('es-MX')} registros normalizados</strong>
            </div>
            <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
              <button class="btn btn-ghost" onclick="runTransformation()">Re-transformar</button>
              <button class="btn btn-primary" onclick="switchTab('consolidate')">Ir a Consolidar <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>
            </div>`
          : `<button class="btn btn-primary btn-lg" onclick="runTransformation()">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              Ejecutar Transformación
            </button>
            <p class="transform-hint">Normaliza las ${totalSheets} hojas al esquema unificado</p>`}
      </div>

      <!-- Resultados de transformación -->
      <div id="transformResults" class="${TransformState.status === 'ready' ? '' : 'hidden'}">
        ${TransformState.status === 'ready' ? renderTransformResults() : ''}
      </div>
    </div>`;
}

function renderMappingCard(sheetName, sheetData) {
  const { meta, headers } = sheetData;
  const { map, log } = buildColumnMap(headers, sheetName);
  const detected = Object.keys(map).length;
  const total = Object.keys(COLUMN_DETECTORS).length;

  return `
    <div class="mapping-card">
      <div class="mapping-card-header">
        <div>
          <span class="mapping-sheet-name">${escHtml(sheetName)}</span>
          <div style="display:flex;gap:6px;margin-top:4px">
            <span class="stag stag-moneda stag-${meta.moneda}">${meta.moneda}</span>
            <span class="stag stag-tipo">${meta.tipo}</span>
            <span class="stag" style="background:rgba(99,102,241,0.15);color:#a78bfa">${meta.banco}</span>
          </div>
        </div>
        <div class="mapping-score ${detected >= 3 ? 'good' : detected >= 2 ? 'ok' : 'warn'}">
          ${detected}/${total}
        </div>
      </div>
      <div class="mapping-fields">
        ${Object.entries(COLUMN_DETECTORS).map(([field]) => {
          const found = map[field] !== undefined;
          const matched = log.find && log.filter ? '' : '';
          return `<div class="mapping-field ${found ? 'found' : 'missing'}">
            <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              ${found ? '<polyline points="20 6 9 17 4 12"/>' : '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'}
            </svg>
            ${field}
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function renderTransformResults() {
  if (!TransformState.processedData || !TransformState.stats) return '';
  const { totalRecords, byBanco, byMoneda, byTipo, skipped } = TransformState.stats;

  return `
    <div class="transform-results-grid">
      <div class="tr-stat-box">
        <span class="tr-stat-num" style="color:var(--income)">${totalRecords.toLocaleString('es-MX')}</span>
        <span class="tr-stat-lbl">Registros normalizados</span>
      </div>
      <div class="tr-stat-box">
        <span class="tr-stat-num" style="color:var(--expense)">${skipped.toLocaleString('es-MX')}</span>
        <span class="tr-stat-lbl">Filas omitidas</span>
      </div>
      <div class="tr-stat-box">
        <span class="tr-stat-num" style="color:var(--accent)">${(byTipo['Ingreso']||0).toLocaleString('es-MX')}</span>
        <span class="tr-stat-lbl">Ingresos</span>
      </div>
      <div class="tr-stat-box">
        <span class="tr-stat-num" style="color:#f59e0b">${(byTipo['Egreso']||0).toLocaleString('es-MX')}</span>
        <span class="tr-stat-lbl">Egresos</span>
      </div>
    </div>
    <div class="transform-breakdown">
      <div class="tb-section">
        <h5>Por Institución</h5>
        ${Object.entries(byBanco).sort((a,b)=>b[1]-a[1]).map(([b,c])=>`
          <div class="tb-row"><span>${b}</span><span class="tb-count">${c.toLocaleString('es-MX')}</span></div>
        `).join('')}
      </div>
      <div class="tb-section">
        <h5>Por Moneda</h5>
        ${Object.entries(byMoneda).map(([m,c])=>`
          <div class="tb-row"><span class="stag stag-moneda stag-${m}">${m}</span><span class="tb-count">${c.toLocaleString('es-MX')}</span></div>
        `).join('')}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════
// EJECUCIÓN
// ══════════════════════════════════════════════════════

function runTransformation() {
  if (ImportState.status !== 'ready') return;

  const allRecords = [];
  const allLogs = [];
  let totalSkipped = 0;

  const { sheets } = ImportState.rawDataFile2;
  for (const [name, sheetData] of Object.entries(sheets)) {
    const { records, skipped, log, meta } = transformSheet(name, sheetData);
    allRecords.push(...records);
    allLogs.push({ sheet: name, meta, log, count: records.length, skipped });
    totalSkipped += skipped;
  }

  // Calcular stats
  const stats = {
    totalRecords: allRecords.length,
    skipped: totalSkipped,
    byBanco: {},
    byMoneda: {},
    byTipo: {},
    bySheet: {},
  };

  for (const r of allRecords) {
    stats.byBanco[r.banco]       = (stats.byBanco[r.banco] || 0) + 1;
    stats.byMoneda[r.moneda]     = (stats.byMoneda[r.moneda] || 0) + 1;
    stats.byTipo[r.tipo]         = (stats.byTipo[r.tipo] || 0) + 1;
    stats.bySheet[r.fuente_hoja] = (stats.bySheet[r.fuente_hoja] || 0) + 1;
  }

  // Ordenar por fecha
  allRecords.sort((a,b) => {
    if (!a.fecha && !b.fecha) return 0;
    if (!a.fecha) return 1;
    if (!b.fecha) return -1;
    return b.fecha - a.fecha;
  });

  TransformState.processedData = allRecords;
  TransformState.mappingLog    = allLogs;
  TransformState.stats         = stats;
  TransformState.status        = 'ready';

  // Notificar consolidador
  if (typeof onTransformComplete === 'function') onTransformComplete();
  updateNavBadges();

  // Re-render el tab
  renderTransformTab();
}

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════

function getFieldType(field) {
  const types = { fecha:'Date', descripcion:'String', monto:'Number',
    tipo:'Ingreso|Egreso', cuenta:'String', moneda:'MXN|USD',
    banco:'String', tipo_cuenta:'String', referencia:'String', saldo:'Number' };
  return types[field] || 'String';
}

function importParseDate(val) {
  if (!val || val === '') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const str = String(val).trim();
  if (!str) return null;
  // ISO: 2023-01-15
  const iso = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (iso) { const d = new Date(+iso[1],+iso[2]-1,+iso[3]); if (!isNaN(d)) return d; }
  // DD/MM/YYYY
  const ddmm = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (ddmm) {
    let yr = +ddmm[3];
    if (yr < 100) yr += yr > 50 ? 1900 : 2000;
    const d = new Date(yr, +ddmm[2]-1, +ddmm[1]);
    if (!isNaN(d)) return d;
  }
  // Direct parse
  const direct = new Date(str);
  if (!isNaN(direct.getTime())) return new Date(direct.getFullYear(), direct.getMonth(), direct.getDate());
  // Excel serial
  if (/^\d{4,6}$/.test(str)) {
    const s = parseInt(str,10);
    if (s > 1 && s < 2958465) {
      const utc = new Date(Math.round((s-25569)*86400*1000));
      return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
    }
  }
  return null;
}

function formatFechaStr(d) {
  if (!d) return 'Sin fecha';
  return d.toLocaleDateString('es-MX', {day:'2-digit',month:'short',year:'numeric'});
}

function onTransformDataAvailable() {
  // Llamado desde importer cuando hay datos frescos
  if (TransformState.status === 'ready') {
    TransformState.status = 'idle'; // Reset para re-transformar
  }
}
