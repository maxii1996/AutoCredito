export const parseInput = (rawValue) => {
  const cleaned = (rawValue ?? '').toString().toLowerCase().replace(/[\.\,\s]+/g, '');
  if (!cleaned) {
    return { value: null, suggestions: [] };
  }
  const match = cleaned.match(/^(\d+)([a-z]*)$/);
  if (!match) {
    return { value: null, suggestions: [] };
  }
  const rawNumber = Number.parseInt(match[1], 10);
  if (Number.isNaN(rawNumber)) {
    return { value: null, suggestions: [] };
  }
  const suffix = match[2];
  if (!suffix) {
    const localized = rawNumber.toLocaleString('es-AR');
    return {
      value: null,
      suggestions: [
        { label: `${localized} Mil`, value: rawNumber * 1_000 },
        { label: `${localized} Millones`, value: rawNumber * 1_000_000 }
      ]
    };
  }
  let multiplier = 1;
  if (suffix === 'k') {
    multiplier = 1_000;
  } else if (suffix === 'kk') {
    multiplier = 1_000_000;
  } else if (suffix.startsWith('mil')) {
    multiplier = 1_000;
  } else if (suffix.startsWith('m') || suffix.startsWith('mill')) {
    multiplier = 1_000_000;
  }
  return { value: rawNumber * multiplier, suggestions: [] };
};

export const parsePercent = (rawValue) => {
  const cleaned = (rawValue ?? '').toString().replace(/[^0-9]/g, '');
  if (!cleaned) {
    return null;
  }
  const value = Number.parseInt(cleaned, 10);
  if (Number.isNaN(value)) {
    return null;
  }
  return Math.max(0, Math.min(100, value));
};
