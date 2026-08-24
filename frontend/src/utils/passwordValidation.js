export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_PATTERN = /^(?=.*[a-zA-Z])(?=.*[0-9])/;

export function isValidPassword(password) {
  if (typeof password !== 'string') return false;
  return password.length >= PASSWORD_MIN_LENGTH && PASSWORD_PATTERN.test(password);
}
