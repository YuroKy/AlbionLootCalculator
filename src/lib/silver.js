export function normalizeSilverInput(value) {
  return String(value ?? '').replace(/[,\s]+/g, '').trim();
}

export function isValidSilverInput(value) {
  const normalized = normalizeSilverInput(value);
  return normalized === '' || /^\d+$/.test(normalized);
}

export function parseSilverInput(value) {
  const normalized = normalizeSilverInput(value);
  if (normalized === '') return 0;

  return Number.parseInt(normalized, 10);
}

export function formatSilver(value) {
  return String(Number(value) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatSilverInput(value) {
  const normalized = normalizeSilverInput(value).replace(/\D/g, '');
  if (normalized === '') return '';

  return formatSilver(Number(normalized));
}
