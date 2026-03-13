import '@testing-library/jest-dom/vitest';

beforeEach(() => {
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});
