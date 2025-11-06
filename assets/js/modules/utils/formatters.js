export const createFormatters = (settings) => {
  const floorDec = (number, decimals) => {
    const factor = 10 ** decimals;
    return Math.trunc(number * factor) / factor;
  };

  const numFmt = (value) => {
    if (value == null || Number.isNaN(value)) {
      return '';
    }
    const processed = settings.dec ? floorDec(value, 2) : Math.trunc(value);
    return new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: settings.dec ? 2 : 0,
      maximumFractionDigits: settings.dec ? 2 : 0
    }).format(processed);
  };

  const simp = (value) => {
    if (!Number.isFinite(value)) {
      return '';
    }
    const millions = Math.trunc(value / 1_000_000);
    const thousands = Math.trunc((value % 1_000_000) / 1_000);
    if (millions === 0) {
      return `${thousands.toLocaleString('es-AR')} Mil`;
    }
    const label = millions === 1 ? 'Millón' : 'Millones';
    if (thousands === 0) {
      return `<strong>${millions.toLocaleString('es-AR')}</strong> <strong>${label}</strong>`;
    }
    return `<strong>${millions.toLocaleString('es-AR')}</strong> <strong>${label}</strong> ${thousands.toLocaleString('es-AR')} Mil`;
  };

  const fmt = (value) => {
    if (value == null || Number.isNaN(value)) {
      return '';
    }
    return settings.simple ? simp(value) : numFmt(value);
  };

  return {
    floorDec,
    numFmt,
    simp,
    fmt
  };
};
