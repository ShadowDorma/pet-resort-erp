export const asArray = (value) => (Array.isArray(value) ? value : []);

export const asObject = (value, fallback = {}) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;

export const requestErrorMessage = (error, fallback) => {
  const code = error?.code || error?.cause?.code;
  const timedOut =
    code === 'ECONNABORTED' ||
    error?.message?.toLowerCase?.().includes('timeout') ||
    error?.message?.toLowerCase?.().includes('tardó');
  if (timedOut) {
    return 'La solicitud tardó demasiado. Revisa la conexión e intenta de nuevo.';
  }
  return error?.response?.data?.message || fallback;
};

export const toDateInputValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return toDateInputValue(new Date());
  }
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const isSameCalendarDay = (value, dateInput) => {
  if (!value) {
    return false;
  }
  const left = new Date(value);
  if (Number.isNaN(left.getTime())) {
    return false;
  }
  const right = dateInput || toDateInputValue();
  return toDateInputValue(left) === right;
};
