# AutoLoom Test Report

Generated from the actual runs that produced this repository (2026-11-06). Every number below came from a command that was executed; nothing here is estimated.

## Environment
- Node.js v22 (project targets ≥ 20), npm 10
- MongoDB **7.0** (conda-forge build, local `mongod` on 127.0.0.1:27017, no replica set)
- Linux sandbox; **no Docker daemon, no AWS access, no graphical browser**

## Summary
| Suite | Command | Result |
|---|---|---|
| Server unit + integration (Jest, Supertest, real MongoDB, DB `autoloom_test`) | `cd server && npm test` | **122 passed / 122**, 0 failed, 12/12 suites |
| Client component/logic (Vitest, React Testing Library, jsdom) | `cd client && npm test` | **34 passed / 34**, 0 failed |
| Live end-to-end smoke (real server + real MongoDB + real node-cron, no mocks) | `BASE_URL=… node tests/e2e-smoke.mjs` | **23 passed, 0 failed** |
| Client production build | `cd client && npm run build` | succeeds |

## Server tests (executed)
| File | Passed / total |
|---|---|
| `tests/integration/auth.test.js` | 6 / 6 |
| `tests/integration/execution.test.js` | 13 / 13 |
| `tests/integration/security.test.js` | 13 / 13 |
| `tests/integration/workflows.test.js` | 11 / 11 |
| `tests/unit/conditions.test.js` | 5 / 5 |
| `tests/unit/cron.test.js` | 2 / 2 |
| `tests/unit/crypto.test.js` | 3 / 3 |
| `tests/unit/interpolate.test.js` | 5 / 5 |
| `tests/unit/runner.http.test.js` | 5 / 5 |
| `tests/unit/runner.test.js` | 12 / 12 |
| `tests/unit/ssrf.test.js` | 37 / 37 |
| `tests/unit/validator.test.js` | 10 / 10 |

Covers: registration/login/invalid credentials/NoSQL injection/protected routes; profile, password change, account deletion; workflow create/update/delete/duplicate/activate/deactivate, validation gate, canvas persistence round-trip; scheduler registration (only active, no duplicates, cleanup, invalid cron, **a real tick executing through the engine**); manual/webhook execution, TRUE and FALSE branches, interpolation, failed-node handling, retry linkage, timeouts, real HTTP round-trips (method/headers/query/JSON body), history filters/pagination/search; cross-user access on every resource route; SSRF (loopback, RFC1918, link-local/metadata, IPv6, mapped IPv4, bad schemes, DNS names, templated URLs); secret encryption at rest and write-only API; malformed/oversized payloads; template seeding/validity/cloning; dashboard figures computed from real records.

## Client tests (executed)
| File | Passed / total |
|---|---|
| `src/test/components.test.jsx` | 16 / 16 |
| `src/test/editor.test.jsx` | 7 / 7 |
| `src/test/validateWorkflow.test.js` | 11 / 11 |

Covers: client-side workflow validation and cycle prevention, node definitions/summaries, config-panel forms per node type, node library (categories, disabled second trigger, drag payload), confirm dialogs, formatters, and the editor component with a mocked API (load, debounced autosave coalescing two edits into one save, failed save + retry, test-run flow, JSON payload validation, no Activate for manual workflows).

## Live end-to-end output
```
AutoLoom E2E smoke test -> http://localhost:5055

[1] Auth
  ok   register
  ok   login
  ok   bad login rejected
  ok   protected route needs token

[2] Templates (seeded at startup)
  ok   six templates available
  ok   clone template into editable workflow

[3] Build a workflow: webhook -> condition -> TRUE / FALSE paths
  ok   create + reload workflow
  ok   webhook URL generated

[4] Webhook + branches
  ok   inactive workflow refuses webhook
  ok   activate
  ok   webhook TRUE branch succeeds
  ok   TRUE path nodes
  ok   FALSE path nodes
  ok   interpolation result stored
  ok   invalid webhook id -> 404

[5] Failure handling + SSRF through the real server
  ok   metadata endpoint blocked, execution failed with message
  ok   failed execution can be retried (linked)

[6] Dashboard reflects real records
  ok   execution counts
  ok   workflow counts

[7] Scheduler (real node-cron, every second)
  ok   scheduled workflow executed by itself
  ok   deactivation stops the schedule

[8] Cross-user isolation
  ok   other user cannot read the workflow
  ok   other user cannot read the execution

23 passed, 0 failed
```

## Defects found by the tests and fixed
1. **Secret leak:** webhook executions stored the raw `Authorization` header in `execution.input`. Found by the webhook integration test; fixed by masking sensitive headers before persisting (`sanitizeTriggerInput`). Regression assertion added.
2. **Existence leak on cancel:** `POST /executions/:id/cancel` answered 409 for another user's execution (404 elsewhere). Now 404 for anything not owned.
3. Test-side mistakes corrected (not product bugs): a wrong numeric expectation for a typed template value, and a miscounted execution total in the smoke script.

## NOT verified (be aware)
- `docker compose up` (Dockerfiles, nginx config, Compose healthchecks): only YAML syntax was checked.
- AWS EC2 deployment steps.
- Any interaction in a real browser: drag-and-drop onto the canvas, React Flow rendering, charts' appearance, the unsaved-changes route blocker dialog, dark-mode visuals. jsdom tests cover logic and DOM structure, not layout.
- The Postman collection was generated and its JSON validated, but it was **not run in Postman** (the same flows are exercised by `tests/e2e-smoke.mjs`).
- Load/performance behaviour, and multi-instance behaviour of the scheduler.
- Screenshots: none captured.
