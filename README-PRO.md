# FinDash Pro — Sistema Modular de 4 Etapas

Sistema de análisis financiero con flujo completo:
**Importar → Transformar → Consolidar → Dashboards**

---

## 🗂 Estructura del Proyecto

```
findash-pro/
├── index.html          # App principal con navegación por tabs
├── styles.css          # Estilos originales (dark mode premium)
├── styles-import.css   # Estilos nuevos para las 4 etapas
├── script.js           # Dashboard original (SMTO multi-hoja)
├── importer.js         # Etapa 1: Ingesta aislada
├── transformer.js      # Etapa 2: Normalización
├── consolidator.js     # Etapa 3: Consolidación + exportar Excel
├── sheet-dashboards.js # Etapa 4: Dashboards por hoja
├── app.js              # Orquestador de pestañas
└── assets/
    └── SMTLogo.png     # Logo (opcional)
```

---

## 🚀 Cómo usar

1. Abre `index.html` en cualquier navegador moderno.
2. Navega entre las 5 pestañas:

| Pestaña | Función |
|---------|---------|
| Dashboard | Dashboard original (archivo INGRESOS/EGRESOS) |
| Importar | Carga el archivo de estados bancarios (aislado) |
| Transformar | Normaliza todas las hojas al esquema estándar |
| Consolidar | Vista final + exportar Excel con múltiples hojas |
| Dashboards | Dashboard visual por cada cuenta/hoja |

---

## 📋 Hojas soportadas (Archivo 2)

| Hoja | Banco | Moneda | Tipo |
|------|-------|--------|------|
| BBVA MXN Cheques | BBVA | MXN | Cheques |
| BBVA MXN Concent | BBVA | MXN | Concentradora |
| BBVA USD Cheques | BBVA | USD | Cheques |
| Monex USD Cheques | Monex | USD | Cheques |
| Monex MXN Cheques | Monex | MXN | Cheques |
| Clara MXN Crédito | Clara | MXN | Crédito |
| Kapital MXN Cheques | Kapital | MXN | Cheques |
| Kapital MXN Flex | Kapital | MXN | Flex |
| Kapital MXN Factoraje | Kapital | MXN | Factoraje |
| Konfio MXN Crédito | Konfio | MXN | Crédito |
| Konfío MXN Tarj Crédito | Konfio | MXN | Tarjeta |
| BBVA MXN Crédito | BBVA | MXN | Crédito |
| Xepelin MXN Crédito | Xepelin | MXN | Crédito |
| Texas Bank USD | Texas Bank | USD | Cheques |

---

## 🏗 Arquitectura de Estados

```
ImportState.rawDataFile2      ← Datos crudos AISLADOS
      ↓
TransformState.processedData  ← Normalizado (esquema estándar)
      ↓
ConsolidateState.finalDataset ← Consolidado (listo para Excel)
      ↓
DashboardState.dashboardData  ← Por hoja (para visualización)
```

**⚠️ Los estados NUNCA se mezclan antes de la transformación.**

---

## 🔌 Sistema de Mapeo Dinámico

Para agregar nuevas hojas, edita `importer.js`:

```javascript
const SHEET_REGISTRY = {
  'mi nuevo banco mxn': {
    banco: 'Mi Banco',
    moneda: 'MXN',
    tipo: 'Cheques',
    institucion: 'Mi Banco S.A.'
  },
  // ... más hojas
};
```

Para nuevas columnas, edita `transformer.js`:

```javascript
const COLUMN_DETECTORS = {
  mi_campo: {
    aliases: ['nombre_col_1', 'nombre_col_2', 'variante'],
    required: false,
  },
};
```

---

## 📊 Excel de Salida

El archivo consolidado incluye:
- **Concentrado** — Todos los movimientos unificados
- **Por Banco** — Una hoja por institución (BBVA, Monex, etc.)
- **Por Moneda** — Moneda MXN / Moneda USD
- **Resumen** — KPIs totales, desglose por banco y moneda

---

## 🔒 Privacidad

Todo el procesamiento ocurre **100% en el navegador**.
Los datos **nunca se envían a ningún servidor**.
