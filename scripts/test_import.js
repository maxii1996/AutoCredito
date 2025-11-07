const fs = require('fs');
const path = require('path');

const isCodigoRow = (value) => /^[0-9]+$/.test(String(value ?? '').trim());

const toNumber = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const collapsed = trimmed.replace(/\s+/g, '');
  if (/^-?\d+(?:\.\d+)?$/.test(collapsed)) return Number.parseFloat(collapsed);
  if (/^-?\d+(?:,\d+)?$/.test(collapsed)) return Number.parseFloat(collapsed.replace(',', '.'));
  const parsed = Number.parseFloat(collapsed.replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(parsed) ? null : parsed;
};

const parsePlanillaRows = (rows) => {
  let added = 0;
  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const codigo = row.Column3;
    if (codigo === 'Código' || !isCodigoRow(codigo)) return;
    const producto = {
      codigo,
      nombre: (row.Column4 || '').trim(),
      valorNominal: toNumber(row.Column8),
      suscripcion: toNumber(row.Column9),
      cuota17: toNumber(row.Column11),
      cuota8mas: toNumber(row.Column12),
      derechoIngreso: toNumber(row.Column13)
    };
    added += 1;
  });
  return added;
};

const filePath = path.join(__dirname, '..', 'Septiembre', 'JSON', 'Autos.json');
const text = fs.readFileSync(filePath, 'utf8');
const data = JSON.parse(text);
const added = parsePlanillaRows(data);
console.log('Registros potenciales detectados:', added);