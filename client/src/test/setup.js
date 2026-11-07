import '@testing-library/jest-dom/vitest';

// jsdom lacks these; React Flow and Recharts expect them.
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = globalThis.ResizeObserver || RO;
globalThis.matchMedia = globalThis.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
