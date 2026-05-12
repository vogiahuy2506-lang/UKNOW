/**
 * Vitest setup — chạy 1 lần trước mỗi file test.
 * Gắn matchers của @testing-library/jest-dom (toBeInTheDocument, ...).
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
