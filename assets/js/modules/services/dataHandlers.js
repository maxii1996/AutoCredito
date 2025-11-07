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

const parsePlanillaRows = (rows, catId, productos, generateId) => {
  rows.forEach((row) => {
    if (!row || typeof row !== 'object') {
      return;
    }
    const codigo = row.Column3;
    if (codigo === 'Código' || !isCodigoRow(codigo)) {
      return;
    }
    productos.push({
      id: generateId(),
      categoriaId: catId,
      codigo,
      nombre: (row.Column4 || '').trim(),
      valorNominal: toNumber(row.Column8),
      suscripcion: toNumber(row.Column9),
      cuota17: toNumber(row.Column11),
      cuota8mas: toNumber(row.Column12),
      derechoIngreso: toNumber(row.Column13)
    });
  });
};

const ensureCategoria = (categorias, catId, nombre) => {
  if (!categorias.some((categoria) => categoria.id === catId)) {
    categorias.push({ id: catId, nombre });
  }
};

const normalizeCategoriaId = (filename) => filename.toLowerCase().replace(/\.json$/i, '');

const toPlainSettings = (settings) => {
  try {
    return JSON.parse(JSON.stringify(settings));
  } catch (error) {
    return {};
  }
};

export const createDataHandlers = ({ categorias, productos, generateId, getSettings }) => {
  const importPlanillas = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) {
      return { imported: 0, errors: [] };
    }

    const errors = [];
    let imported = 0;

    for (const file of files) {
      try {
        const data = await readFileAsJSON(file);
        if (!Array.isArray(data)) {
          throw new Error('JSON inválido');
        }
        const baseName = file.name.replace(/\.json$/i, '');
        const catId = normalizeCategoriaId(file.name);
        ensureCategoria(categorias, catId, baseName);
        parsePlanillaRows(data, catId, productos, generateId);
        imported += 1;
      } catch (error) {
        errors.push(`${file.name}: ${error.message || error}`);
      }
    }

    return { imported, errors };
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
      return { success: true };
    } catch (error) {
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
  };

  const deleteProduct = (id) => {
    const index = productos.findIndex((producto) => producto.id === id);
    if (index > -1) {
      productos.splice(index, 1);
    }
  };

  return {
    importPlanillas,
    importBase,
    exportBase,
    deleteProduct
  };
};
