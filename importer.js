/* ══════════════════════════════════════════════════════
   importer.js — ETAPA 1: Ingesta Aislada de Datos
   Estado independiente: rawDataFile2
   NO mezcla datos con el dashboard principal.
══════════════════════════════════════════════════════ */

'use strict';

// ─── ESTADO AISLADO ────────────────────────────────────
const ImportState = {
  rawDataFile2: null,        // { fileName, sheets: { [name]: { headers, rows } } }
  detectedSheets: [],        // nombres de hojas detectadas
  status: 'idle',            // idle | loading | ready | error
};

// ─── CONFIGURACIÓN DE HOJAS CONOCIDAS ─────────────────
// Sistema de mapeo dinámico: agregar nuevas hojas sin reescribir lógica
const SHEET_REGISTRY = {
  // Patrón: keyword (lowercase) → metadatos
  'bbva mxn cheques':        { banco:'BBVA',    moneda:'MXN', tipo:'Cheques',    institucion:'BBVA Bancomer' },
  'bbva mxn concent':        { banco:'BBVA',    moneda:'MXN', tipo:'Concentradora', institucion:'BBVA Bancomer' },
  'bbva usd cheques':        { banco:'BBVA',    moneda:'USD', tipo:'Cheques',    institucion:'BBVA Bancomer' },
  'monex usd cheques':       { banco:'Monex',   moneda:'USD', tipo:'Cheques',    institucion:'Monex' },
  'monex mxn cheques':       { banco:'Monex',   moneda:'MXN', tipo:'Cheques',    institucion:'Monex' },
  'clara mxn crédito':       { banco:'Clara',   moneda:'MXN', tipo:'Crédito',    institucion:'Clara' },
  'clara mxn credito':       { banco:'Clara',   moneda:'MXN', tipo:'Crédito',    institucion:'Clara' },
  'kapital mxn cheques':     { banco:'Kapital', moneda:'MXN', tipo:'Cheques',    institucion:'Kapital' },
  'kapital mxn flex':        { banco:'Kapital', moneda:'MXN', tipo:'Flex',       institucion:'Kapital' },
  'kapital mxn factoraje':   { banco:'Kapital', moneda:'MXN', tipo:'Factoraje',  institucion:'Kapital' },
  'konfio mxn crédito':      { banco:'Konfio',  moneda:'MXN', tipo:'Crédito',    institucion:'Konfio' },
  'konfio mxn credito':      { banco:'Konfio',  moneda:'MXN', tipo:'Crédito',    institucion:'Konfio' },
  'konfío mxn tarj crédito': { banco:'Konfio',  moneda:'MXN', tipo:'Tarjeta Crédito', institucion:'Konfio' },
  'konfío mxn tarj credito': { banco:'Konfio',  moneda:'MXN', tipo:'Tarjeta Crédito', institucion:'Konfio' },
  'bbva mxn crédito':        { banco:'BBVA',    moneda:'MXN', tipo:'Crédito',    institucion:'BBVA Bancomer' },
  'bbva mxn credito':        { banco:'BBVA',    moneda:'MXN', tipo:'Crédito',    institucion:'BBVA Bancomer' },
  'xepelin mxn crédito':     { banco:'Xepelin', moneda:'MXN', tipo:'Crédito',    institucion:'Xepelin' },
  'xepelin mxn credito':     { banco:'Xepelin', moneda:'MXN', tipo:'Crédito',    institucion:'Xepelin' },
  'texas bank usd':          { banco:'Texas Bank', moneda:'USD', tipo:'Cheques', institucion:'Texas Bank' },
};

/** Lookup en el registry por nombre de hoja. */
function resolveSheetMeta(sheetName) {
  const key = sheetName.toLowerCase().trim();
  // Exacto primero
  if (SHEET_REGISTRY[key]) return { ...SHEET_REGISTRY[key], sheetName };
  // Parcial: buscar si la key del registry está contenida en el nombre
  for (const [pattern, meta] of Object.entries(SHEET_REGISTRY)) {
    if (key.includes(pattern) || pattern.includes(key)) {
      return { ...meta, sheetName };
    }
  }
  // Fallback: inferir desde el nombre
  return inferSheetMeta(sheetName);
}

/** Infiere metadatos de una hoja desconocida. */
function inferSheetMeta(sheetName) {
  const name = sheetName.toUpperCase();
  const moneda = name.includes('USD') ? 'USD' : 'MXN';
  let banco = 'Desconocido';
  const bancos = ['BBVA','MONEX','KAPITAL','KONFIO','XEPELIN','CLARA','TEXAS'];
  for (const b of bancos) {
    if (name.includes(b)) { banco = b.charAt(0) + b.slice(1).toLowerCase(); break; }
  }
  let tipo = 'General';
  if (name.includes('CHEQUE')) tipo = 'Cheques';
  else if (name.includes('CRÉDIT') || name.includes('CREDIT')) tipo = 'Crédito';
  else if (name.includes('FACTOR')) tipo = 'Factoraje';
  else if (name.includes('TARJ')) tipo = 'Tarjeta';
  else if (name.includes('FLEX')) tipo = 'Flex';
  else if (name.includes('CONCENT')) tipo = 'Concentradora';
  return { banco, moneda, tipo, institucion: banco, sheetName };
}

// ══════════════════════════════════════════════════════
// RENDER — Tab de Importación
// ══════════════════════════════════════════════════════

function renderImportTab() {
  const app = document.getElementById('import-app');
  app.innerHTML = `
    <div class="import-page">
      <div class="import-hero">
        <div class="import-badge">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Etapa 1 — Ingesta Aislada
        </div>
        <h2 class="import-title">Importación de Datos Crudos</h2>
        <p class="import-subtitle">Carga tu archivo de estados de cuenta bancarios. Los datos se almacenan de forma completamente independiente sin afectar otros módulos.</p>
      </div>

      <!-- Drop Zone File 2 -->
      <div id="importDropZone" class="import-drop-zone"
        ondragover="importHandleDragOver(event)"
        ondragleave="importHandleDragLeave(event)"
        ondrop="importHandleDrop(event)"
        onclick="importTriggerFileInput()">
        <input type="file" id="importFileInput" accept=".xlsx,.xls" style="display:none" onchange="importHandleFileChange(event)"/>
        <div class="import-drop-content">
          <div class="import-drop-icon">
            <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/>
            </svg>
          </div>
          <p class="import-drop-text">Arrastra tu archivo de estados bancarios</p>
          <p class="import-drop-sub">BBVA · Monex · Kapital · Konfio · Xepelin · Clara · Texas Bank</p>
          <span class="drop-format-badge">.xlsx &nbsp;·&nbsp; .xls</span>
        </div>
      </div>

      <div id="importErrorMsg" class="error-message hidden">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span id="importErrorText"></span>
      </div>

      <!-- Loading -->
      <div id="importLoading" class="import-loading hidden">
        <div class="spinner"></div>
        <span>Leyendo hojas del archivo…</span>
      </div>

      <!-- Results -->
      <div id="importResults" class="import-results hidden"></div>
    </div>`;

  // Si ya hay datos, mostrar resultados inmediatamente
  if (ImportState.status === 'ready') {
    renderImportResults();
  }
}

// ══════════════════════════════════════════════════════
// FILE HANDLING
// ══════════════════════════════════════════════════════

function importTriggerFileInput() {
  document.getElementById('importFileInput').click();
}
function importHandleDragOver(e) {
  e.preventDefault();
  document.getElementById('importDropZone').classList.add('drag-over');
}
function importHandleDragLeave(e) {
  e.preventDefault();
  document.getElementById('importDropZone').classList.remove('drag-over');
}
function importHandleDrop(e) {
  e.preventDefault();
  document.getElementById('importDropZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) importProcessFile(file);
}
function importHandleFileChange(e) {
  const file = e.target.files[0];
  if (file) importProcessFile(file);
}

function importProcessFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx','xls'].includes(ext)) {
    importShowError('El archivo debe ser .xlsx o .xls');
    return;
  }
  importHideError();
  document.getElementById('importLoading').classList.remove('hidden');
  document.getElementById('importResults').classList.add('hidden');

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array', raw: false, dateNF: 'yyyy-mm-dd' });
      importParseWorkbook(wb, file.name);
    } catch(err) {
      document.getElementById('importLoading').classList.add('hidden');
      importShowError('Error al leer el archivo: ' + err.message);
    }
  };
  reader.onerror = () => {
    document.getElementById('importLoading').classList.add('hidden');
    importShowError('No se pudo leer el archivo.');
  };
  reader.readAsArrayBuffer(file);
}

// ══════════════════════════════════════════════════════
// PARSING — Lee RAW sin transformar
// ══════════════════════════════════════════════════════

function importParseWorkbook(wb, fileName) {
  const sheets = {};
  const detected = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    // Leer como array de arrays de strings (formato RAW)
    const raw = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      dateNF: 'yyyy-mm-dd',
      defval: '',
    });

    if (!raw || raw.length < 2) continue;

    // Buscar primera fila no vacía como headers
    let headerIdx = -1;
    let headers = [];
    for (let i = 0; i < Math.min(20, raw.length); i++) {
      const row = raw[i];
      if (row && row.some(c => c && String(c).trim())) {
        // Verificar que sea una fila de encabezados (tiene texto variado)
        const nonEmpty = row.filter(c => c && String(c).trim());
        if (nonEmpty.length >= 2) {
          headerIdx = i;
          headers = row.map(c => String(c || '').trim());
          break;
        }
      }
    }

    if (headerIdx === -1) continue;

    // Leer todas las filas de datos
    const dataRows = [];
    for (let i = headerIdx + 1; i < raw.length; i++) {
      const row = raw[i];
      if (!row || !row.some(c => c && String(c).trim())) continue;
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h || `col_${idx}`] = String(row[idx] || '').trim();
      });
      dataRows.push(obj);
    }

    if (dataRows.length === 0) continue;

    const meta = resolveSheetMeta(sheetName);
    sheets[sheetName] = {
      meta,
      headers: headers.filter(h => h),
      rows: dataRows,
      rowCount: dataRows.length,
    };
    detected.push(sheetName);
  }

  // Guardar en estado AISLADO
  ImportState.rawDataFile2 = { fileName, sheets, loadedAt: new Date() };
  ImportState.detectedSheets = detected;
  ImportState.status = 'ready';

  document.getElementById('importLoading').classList.add('hidden');
  renderImportResults();

  // Notificar a otros módulos que hay datos nuevos
  onImportComplete();
}

// ══════════════════════════════════════════════════════
// RENDER RESULTADOS
// ══════════════════════════════════════════════════════

function renderImportResults() {
  const container = document.getElementById('importResults');
  if (!container) return;
  container.classList.remove('hidden');

  const { fileName, sheets, loadedAt } = ImportState.rawDataFile2;
  const totalRows = Object.values(sheets).reduce((s, sh) => s + sh.rowCount, 0);
  const sheetCount = Object.keys(sheets).length;

  // Agrupar por banco
  const byBanco = {};
  for (const [name, sh] of Object.entries(sheets)) {
    const b = sh.meta.banco;
    if (!byBanco[b]) byBanco[b] = [];
    byBanco[b].push({ name, ...sh });
  }

  container.innerHTML = `
    <div class="import-success-banner">
      <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <div>
        <strong>Archivo cargado exitosamente</strong>
        <span>${fileName} · ${sheetCount} hojas · ${totalRows.toLocaleString('es-MX')} registros totales · ${loadedAt.toLocaleTimeString('es-MX')}</span>
      </div>
      <button class="import-reload-btn" onclick="importTriggerFileInput()">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.49"/>
        </svg>
        Cambiar
      </button>
    </div>

    <!-- Summary KPIs -->
    <div class="import-kpi-row">
      <div class="import-kpi-box">
        <span class="import-kpi-num">${sheetCount}</span>
        <span class="import-kpi-lbl">Hojas detectadas</span>
      </div>
      <div class="import-kpi-box">
        <span class="import-kpi-num">${totalRows.toLocaleString('es-MX')}</span>
        <span class="import-kpi-lbl">Registros totales</span>
      </div>
      <div class="import-kpi-box">
        <span class="import-kpi-num">${Object.keys(byBanco).length}</span>
        <span class="import-kpi-lbl">Instituciones</span>
      </div>
      <div class="import-kpi-box">
        <span class="import-kpi-num">${[...new Set(Object.values(sheets).map(s=>s.meta.moneda))].join(' / ')}</span>
        <span class="import-kpi-lbl">Monedas</span>
      </div>
    </div>

    <!-- Sheets por banco -->
    ${Object.entries(byBanco).map(([banco, sheetList]) => `
      <div class="import-banco-group">
        <div class="import-banco-header">
          <div class="import-banco-pill">${banco}</div>
          <span class="import-banco-count">${sheetList.length} ${sheetList.length===1?'cuenta':'cuentas'} · ${sheetList.reduce((s,sh)=>s+sh.rowCount,0).toLocaleString('es-MX')} registros</span>
        </div>
        <div class="import-sheets-grid">
          ${sheetList.map(sh => `
            <div class="import-sheet-card" onclick="toggleSheetPreview('${escHtml(sh.name)}')">
              <div class="import-sheet-top">
                <div class="import-sheet-info">
                  <span class="import-sheet-name">${escHtml(sh.name)}</span>
                  <div class="import-sheet-tags">
                    <span class="stag stag-moneda stag-${sh.meta.moneda}">${sh.meta.moneda}</span>
                    <span class="stag stag-tipo">${sh.meta.tipo}</span>
                  </div>
                </div>
                <div class="import-sheet-meta">
                  <span class="import-row-count">${sh.rowCount.toLocaleString('es-MX')}</span>
                  <span class="import-row-label">filas</span>
                </div>
              </div>
              <div class="import-sheet-cols">
                ${sh.headers.slice(0,5).map(h=>`<span class="col-chip">${escHtml(h)}</span>`).join('')}
                ${sh.headers.length > 5 ? `<span class="col-chip col-chip-more">+${sh.headers.length-5}</span>` : ''}
              </div>
              <div id="preview-${escHtml(sh.name).replace(/\s/g,'-')}" class="sheet-preview hidden">
                ${renderSheetPreviewTable(sh)}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}

    <!-- CTA -->
    <div class="import-cta">
      <div class="import-cta-text">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Los datos están listos en estado aislado. Ve a <strong>Transformar</strong> para normalizar y unificar.
      </div>
      <button class="btn btn-primary" onclick="switchTab('transform')">
        Ir a Transformar
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
        </svg>
      </button>
    </div>`;
}

function renderSheetPreviewTable(sh) {
  const previewRows = sh.rows.slice(0, 5);
  const cols = sh.headers.slice(0, 6);
  return `
    <table class="preview-table">
      <thead><tr>${cols.map(c=>`<th>${escHtml(c)}</th>`).join('')}${sh.headers.length>6?'<th>…</th>':''}</tr></thead>
      <tbody>
        ${previewRows.map(row=>`<tr>${cols.map(c=>`<td>${escHtml(row[c]||'—')}</td>`).join('')}${sh.headers.length>6?'<td>…</td>':''}</tr>`).join('')}
      </tbody>
    </table>
    <p class="preview-note">${sh.rowCount > 5 ? `Mostrando 5 de ${sh.rowCount.toLocaleString('es-MX')} filas` : `${sh.rowCount} filas totales`}</p>`;
}

function toggleSheetPreview(sheetName) {
  const id = 'preview-' + sheetName.replace(/\s/g,'-');
  const el = document.getElementById(id);
  if (el) el.classList.toggle('hidden');
}

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════

function importShowError(msg) {
  const el = document.getElementById('importErrorMsg');
  const txt = document.getElementById('importErrorText');
  if (el && txt) { txt.textContent = msg; el.classList.remove('hidden'); }
}
function importHideError() {
  const el = document.getElementById('importErrorMsg');
  if (el) el.classList.add('hidden');
}

function onImportComplete() {
  // Notificar módulos dependientes
  if (typeof onTransformDataAvailable === 'function') onTransformDataAvailable();
  if (typeof onSheetDashboardsAvailable === 'function') onSheetDashboardsAvailable();
  // Actualizar badges en el nav
  updateNavBadges();
}
