const clone = (value) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

export const loadFromStorage = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return clone(fallback);
    }
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`No fue posible leer ${key} desde localStorage:`, error);
    return clone(fallback);
  }
};

export const saveToStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`No fue posible guardar ${key} en localStorage:`, error);
  }
};

export const mergeDeep = (target, source) => {
  if (!source || typeof source !== 'object') {
    return target;
  }

  Object.keys(source).forEach((key) => {
    const value = source[key];
    if (Array.isArray(value)) {
      target[key] = value.slice();
      return;
    }
    if (value && typeof value === 'object') {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      mergeDeep(target[key], value);
      return;
    }
    target[key] = value;
  });

  return target;
};

export const mergeSettings = (defaults, stored) => {
  const base = clone(defaults);
  return mergeDeep(base, stored);
};
