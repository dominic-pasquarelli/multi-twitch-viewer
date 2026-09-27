import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  // Desktop (main-process) tests run in plain Node, without browser storage.
  if (typeof localStorage !== 'undefined') localStorage.clear();
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
});
