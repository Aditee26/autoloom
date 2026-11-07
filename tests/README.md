# Root-level tests

- `e2e-smoke.mjs`: live end-to-end smoke test. Start the API (and MongoDB), then:
  `BASE_URL=http://localhost:5000 node tests/e2e-smoke.mjs`
  It registers a throw-away user and exercises auth, templates, webhook branching, SSRF blocking, retries, dashboard numbers, a real every-second schedule, and cross-user isolation.

Unit/integration tests live next to the code: `server/tests/**` (Jest) and `client/src/test/**` (Vitest).
