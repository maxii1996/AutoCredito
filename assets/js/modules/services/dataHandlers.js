const isCodigoRow = (value) => /^[0-9]+$/.test(String(value ?? '').trim());

const toNumber = (value) => {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }
  const collapsed = trimmed.replace(/\s+/g, '');
  if (/^-?\d+(?:\.\d+)?$/.test(collapsed)) {
    const parsed = Number.parseFloat(collapsed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (/^-?\d+(?:,\d+)?$/.test(collapsed)) {
    const parsed = Number.parseFloat(collapsed.replace(',', '.'));
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(collapsed)) {
    const normalized = collapsed.replace(/\./g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(collapsed)) {
    const normalized = collapsed.replace(/,/g, '');
    const parsed = Number.parseFloat(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const parsed = Number.parseFloat(collapsed.replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(parsed) ? null : parsed;
};

const readFileAsJSON = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      resolve(parsed);
    } catch (error) {
      reject(error);
    }
  };
  reader.onerror = () => {
    reject(reader.error || new Error('No se pudo leer el archivo.'));
  };
  reader.readAsText(file);
});

const getPdfLib = () => {
  if (typeof window === 'undefined' || !window.pdfjsLib) {
    throw new Error('La librería PDF.js no está disponible.');
  }
  if (window.pdfjsLib?.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  return window.pdfjsLib;
};

const extractTextFromPDF = async (file) => {
  const pdfjsLib = getPdfLib();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items.map((item) => item.str);
    fullText += `${strings.join(' ')}\n`;
  }
  return fullText;
};

const extractCodigoRows = (text) => {
  const rows = [];
  const regex = /(\d{5})\s+([\d\.\,]+)\s+\$?\s*([\d\.\,]+)\s+\$?\s*([\d\.\,]+)\s+\$?\s*([\d\.\,]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    rows.push({
      codigo: match[1],
      valorNominalRaw: match[2],
      cuota1_7Raw: match[3],
      cuota8AdelanteRaw: match[4],
      derechoIngresoRaw: match[5]
    });
  }
  return rows;
};

const extractDescripcionRows = (text) => {
  const upper = text;
  const sectionMatch = upper.match(/Descripción\s+Suscripción([\s\S]+)/i);
  if (!sectionMatch) return [];
  const section = sectionMatch[1];
  const rows = [];
  const regex = /([A-ZÁÉÍÓÚÜÑ0-9 ]+?)\s+\$([\d\.\,]+)/g;
  let match;
  while ((match = regex.exec(section)) !== null) {
    const descripcion = match[1].trim();
    if (!descripcion) continue;
    rows.push({
      descripcion,
      suscripcionRaw: match[2]
    });
  }
  return rows;
};

const buildItemsFromPdfText = (text) => {
  const normalized = text.replace(/\r/g, '');
  const codigoRows = extractCodigoRows(normalized);
  const descripcionRows = extractDescripcionRows(normalized);
  const len = Math.max(codigoRows.length, descripcionRows.length);
  const items = [];
  for (let i = 0; i < len; i += 1) {
    const c = codigoRows[i] || {};
    const d = descripcionRows[i] || {};
    items.push({
      codigo: c.codigo || null,
      descripcion: d.descripcion || null,
      valorNominal: toNumber(c.valorNominalRaw),
      suscripcion: toNumber(d.suscripcionRaw),
      cuota1_7: toNumber(c.cuota1_7Raw),
      cuota_8_adelante: toNumber(c.cuota8AdelanteRaw),
      derechoIngreso: toNumber(c.derechoIngresoRaw)
    });
  }
  return items;
};

const resolveRowValue = (row, keys) => {
  if (!row) return undefined;
  // row can be an object with named properties or an array-like object
  for (const key of keys) {
    if (row[key] != null) return row[key];
    // also try lowercase key
    if (typeof key === 'string' && row[key.toLowerCase()] != null) return row[key.toLowerCase()];
  }
  // if row is an array-like, try numeric indices
  if (Array.isArray(row)) {
    for (const k of keys) {
      const idx = Number(k.replace(/[^0-9]/g, ''));
      if (!Number.isNaN(idx) && row[idx] != null) return row[idx];
    }
  }
  return undefined;
};

const parsePlanillaRows = (rows, catId, productos, generateId) => {
  let added = 0;
  if (!Array.isArray(rows)) return 0;

  rows.forEach((row) => {
    if (!row || (typeof row !== 'object' && !Array.isArray(row))) {
      return;
    }

    // Try several candidate keys for the code and other columns to be tolerant
    const codigo = resolveRowValue(row, ['Column3', 'column3', 'Codigo', 'CÃ³digo', 'Código', 'codigo', '3', '2', '0']);
    // Skip header-like rows or non-numeric codes
    if (codigo === 'Código' || codigo === 'Codigo' || !isCodigoRow(codigo)) {
      return;
    }

    const nombre = String(resolveRowValue(row, ['Column4', 'column4', 'Descripción', 'Descripcion', 'descripcion', '4', '3']) || '').trim();
    const valorNominal = toNumber(resolveRowValue(row, ['Column8', 'column8', 'Valor Nominal', 'Valor', '8', '7']));
    const suscripcion = toNumber(resolveRowValue(row, ['Column9', 'column9', 'Suscripción', 'Suscripcion', '9', '8']));
    const cuota17 = toNumber(resolveRowValue(row, ['Column11', 'column11', 'Cuota 1 a 7', '11', '10']));
    const cuota8mas = toNumber(resolveRowValue(row, ['Column12', 'column12', 'Cuota 8 en adelante', '12', '11']));
    const derechoIngreso = toNumber(resolveRowValue(row, ['Column13', 'column13', 'Derecho de Ingreso', '13', '12']));

    productos.push({
      id: generateId(),
      categoriaId: catId,
      codigo,
      nombre,
      valorNominal,
      suscripcion,
      cuota17,
      cuota8mas,
      derechoIngreso
    });
    added += 1;
  });
  return added;
};

const ensureCategoria = (categorias, catId, nombre) => {
  if (!categorias.some((categoria) => categoria.id === catId)) {
    categorias.push({ id: catId, nombre });
  }
};

const normalizeCategoriaId = (filename) => filename.toLowerCase().replace(/\.json$/i, '');

const normalizeCategoriaIdFromPdf = (filename) => filename.toLowerCase().replace(/\.pdf$/i, '');

const importPdfPlanilla = async (file, catId, productos, generateId) => {
  const text = await extractTextFromPDF(file);
  const items = buildItemsFromPdfText(text);
  let added = 0;

  items.forEach((item) => {
    if (!item) return;
    const codigo = item.codigo;
    if (!isCodigoRow(codigo)) return;
    productos.push({
      id: generateId(),
      categoriaId: catId,
      codigo,
      nombre: (item.descripcion || '').trim(),
      valorNominal: toNumber(item.valorNominal),
      suscripcion: toNumber(item.suscripcion),
      cuota17: toNumber(item.cuota1_7),
      cuota8mas: toNumber(item.cuota_8_adelante),
      derechoIngreso: toNumber(item.derechoIngreso)
    });
    added += 1;
  });

  return added;
};

const toPlainSettings = (settings) => {
  try {
    return JSON.parse(JSON.stringify(settings));
  } catch (error) {
    return {};
  }
};

export const createDataHandlers = ({ categorias, productos, generateId, getSettings, onDataChange }) => {
  const emitChange = () => {
    if (typeof onDataChange === 'function') {
      onDataChange();
    }
  };

  const importPlanillas = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) {
      return { imported: 0, errors: [] };
    }

    const errors = [];
    let imported = 0;
    let totalAdded = 0;

    const isPdfFile = (file) => file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name));

    for (const file of files) {
      console.log('Procesando planilla', { archivo: file.name, tamano: file.size });
      try {
        if (isPdfFile(file)) {
          const baseName = file.name.replace(/\.pdf$/i, '');
          const catId = normalizeCategoriaIdFromPdf(file.name);
          ensureCategoria(categorias, catId, baseName);
          console.log('Categoría verificada (PDF)', { id: catId, nombre: baseName });
          const added = await importPdfPlanilla(file, catId, productos, generateId);
          console.log('Filas procesadas (PDF)', { archivo: file.name, productosAgregados: added });
          totalAdded += added;
          imported += 1;
        } else {
          const data = await readFileAsJSON(file);
          // Aceptar arrays o detectar un array dentro de un objeto (caso de formatos distintos)
          let rows = data;
          if (!Array.isArray(data)) {
            // Prefer explicit keys like 'rows' o 'data', si existen
            if (Array.isArray(data.rows)) {
              rows = data.rows;
            } else if (Array.isArray(data.data)) {
              rows = data.data;
            } else {
              // Buscar el primer valor que sea un array
              const candidate = Object.values(data).find((v) => Array.isArray(v));
              if (candidate && Array.isArray(candidate)) {
                rows = candidate;
              }
            }
          }
          if (!Array.isArray(rows)) {
            throw new Error('JSON inválido: no contiene un array de filas.');
          }
          const baseName = file.name.replace(/\.json$/i, '');
          const catId = normalizeCategoriaId(file.name);
          ensureCategoria(categorias, catId, baseName);
          console.log('Categoría verificada', { id: catId, nombre: baseName });
          const added = parsePlanillaRows(rows, catId, productos, generateId);
          console.log('Filas procesadas', { archivo: file.name, productosAgregados: added });
          totalAdded += added;
          imported += 1;
        }
      } catch (error) {
        console.error('Error procesando planilla', { archivo: file.name, detalle: error });
        errors.push(`${file.name}: ${error.message || error}`);
      }
    }

    if (totalAdded > 0) {
      emitChange();
    }

    console.log('Resumen importación planillas', {
      archivosProcesados: imported,
      productosAgregados: totalAdded,
      errores: errors
    });

    return { imported, errors, added: totalAdded };
  };

  const importBase = async (file) => {
    try {
      const data = await readFileAsJSON(file);
      if (!data || !Array.isArray(data.categorias) || !Array.isArray(data.productos)) {
        throw new Error('JSON base inválido');
      }
      categorias.splice(0, categorias.length);
      data.categorias.forEach((categoria) => categorias.push(categoria));
      productos.splice(0, productos.length);
      data.productos.forEach((producto) => productos.push(producto));
      emitChange();
      console.log('Base importada correctamente', {
        categorias: data.categorias.length,
        productos: data.productos.length,
        archivo: file.name
      });
      return {
        success: true,
        categorias: data.categorias.length,
        productos: data.productos.length
      };
    } catch (error) {
      console.error('Error al importar base', { archivo: file.name, detalle: error });
      return { success: false, error: error.message || String(error) };
    }
  };

  const exportBase = (filename = 'base.json') => {
    const payload = {
      categorias: categorias.map((categoria) => ({ ...categoria })),
      productos: productos.map((producto) => ({ ...producto })),
      settings: toPlainSettings(getSettings())
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    console.log('Exportación generada', {
      archivo: filename,
      categorias: payload.categorias.length,
      productos: payload.productos.length
    });
  };

  const deleteProduct = (id) => {
    const index = productos.findIndex((producto) => producto.id === id);
    if (index > -1) {
      productos.splice(index, 1);
      emitChange();
      console.log('Producto eliminado', { id });
    }
  };

  return {
    importPlanillas,
    importBase,
    exportBase,
    deleteProduct
  };
};
