# AutoLoom: Implementation Plan

This document records the plan the project was built to, and the decisions made along the way.

## 1. Goals
A working visual workflow-automation platform: triggers → conditions → actions on a React Flow canvas, executed by a real Node.js engine, with webhooks, node-cron schedules, execution history, templates, integrations and per-user data isolation. JavaScript only; MERN + the libraries named in the brief; no extra infrastructure.

## 2. Architecture
```
React (Vite, Tailwind, React Flow, Recharts)  ──HTTP/JSON──▶  Express API ──▶ MongoDB (Mongoose)
        nginx (Docker) serves the SPA and proxies /api            │
                                                                   ├─ workflowEngine (pure runner + validator + interpolation)
                                                                   ├─ nodeHandlers (trigger, condition, http, delay, variable, log)
                                                                   └─ scheduler (node-cron registry)
```
Key decision: **the engine core (`workflowEngine/runner.js`) has no database access.** Persistence is injected (`onNodeResult`, `shouldCancel`, `loadIntegration`, `httpClient`). `executionService.runWorkflow` is the only place that writes executions, and manual runs, webhooks, schedules and retries all go through it, so there is exactly one execution path.

## 3. Data model
| Collection | Notes |
|---|---|
| User | bcrypt hash (`select:false`), workspace name, theme, execution preferences |
| Workflow | `nodes`/`edges` stored exactly as React Flow needs them (sanitised), `status`, derived `triggerType`, unguessable `webhookId` (48 hex chars, sparse-unique) |
| Execution | per-node `nodeResults`, sanitised trigger input, `executionContext`, logs, timings, `error`; `workflowName` snapshot so history survives workflow deletion |
| Integration | config + `encryptedCredentials` (AES-256-GCM, `select:false`, never serialised) |
| Template | six seeded definitions (upserted by slug on startup) |

Indexes: `Workflow(userId, updatedAt)`, `Workflow(userId, status)`, `Execution(userId, startedAt)`, `Execution(userId, workflowId, startedAt)`, `Execution(userId, status)`, unique `User.email`, unique sparse `Workflow.webhookId`, unique `Integration(userId, name)`.

## 4. Execution semantics
1. Validate (exactly one trigger, known types, edges reference real nodes, no cycles, everything reachable from the trigger, per-node config rules).
2. Create `running` execution; build context `{ trigger, variables, nodes, execution }`.
3. Breadth-first traversal from the trigger. Each node's config is interpolated (`{{ path }}`, own-property lookups only, no `eval`), run by its handler, and its output stored in `context.nodes[nodeId]`.
4. Condition → `branch: 'true'|'false'`; only edges with the matching `sourceHandle` are followed.
5. A node reached through several paths (diamond merge) runs once.
6. A failed node stops the run (`failed`, `error.nodeId`). Caps: 50 node executions, 120 s total runtime; cancellation checked between nodes.
7. Final status/duration/context persisted. On server start, any execution left `running` is marked `failed`.

HTTP node: SSRF guard (syntax check, DNS pre-check, **re-check at connect time** via a custom `lookup`), no redirects, timeout, ≤1 MB response, retry (0–3) on network errors/429/5xx, sensitive headers masked in history.

## 4b. Phases and what was verified in each
| Phase | Outcome |
|---|---|
| Foundation, models, auth | Express app, Mongoose models, JWT/bcrypt, validators, rate limiting, Helmet, NoSQL sanitising. Covered by Supertest tests. |
| Engine + handlers | Unit-tested in isolation (interpolation, operators, validator, cron, runner, real HTTP socket round-trips). |
| Workflows/executions/webhooks/scheduler | Supertest against real MongoDB 7, plus a live-server E2E script that exercises node-cron every second. |
| Integrations + security | Encryption at rest, write-only secrets, cross-user isolation on every route, SSRF via the API. |
| Client | Vite/React build, 8 node types, config forms, autosave, unsaved-changes guard, test runs. Component + editor tests with Vitest/RTL. |
| Docker/docs | Files written and syntax-checked; **not run** (no Docker daemon in the build environment). |

## 5. Decisions and trade-offs
- **Synchronous execution in the request.** Brief: sequential, no distributed workers. Webhook callers get the result (200 success / 422 failed). Long chains hold the HTTP request open (nginx timeout 150 s).
- **Drafts may be saved invalid; running/activating may not.** Autosave must not be blocked by half-built canvases; the server re-validates on activate/execute and deactivates an active workflow that is edited into an invalid state.
- **404 instead of 403** for other users' resources, so existence isn't revealed.
- **Manual-trigger workflows can't be "activated"** (nothing to listen for); they run via Test/Run.
- **Static URL validation skips templated URLs** (`{{…}}`); those are validated at run time.
- **Postman/E2E use the public API only**, so they can run against any deployment.
