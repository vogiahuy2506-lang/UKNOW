function enabled(value) {
  return String(value || '').toLowerCase() === 'true';
}

function isPositiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0;
}

export function validateStorageEnv(env = process.env) {
  if (!enabled(env.STORAGE_WIDGET_CAP_ENABLED)) return;
  const required = [
    'STORAGE_WIDGET_BYTES_PER_IP_PER_DAY',
    'STORAGE_WIDGET_BYTES_PER_CHATBOT_PER_DAY',
  ];
  const invalid = required.filter((key) => !isPositiveInteger(env[key]));
  if (invalid.length) {
    throw new Error(
      `STORAGE_WIDGET_CAP_ENABLED requires positive integer values: ${invalid.join(', ')}`
    );
  }
}
