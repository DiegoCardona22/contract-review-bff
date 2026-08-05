# contract-review-bff

[![CI](https://github.com/diegocardonah/contract-review-bff/actions/workflows/ci.yml/badge.svg)](https://github.com/diegocardonah/contract-review-bff/actions/workflows/ci.yml)

A Backend-for-Frontend that composes four legal-tech microservices into the payloads a contract-review UI actually needs — and keeps serving when they misbehave.

> **Why this exists.** A contract overview screen needs the document, its owner, its risk analysis and its activity. Four services own those. Letting the browser fan out to all four means four round trips, CORS on every service, and a UI that breaks whenever the slowest one hiccups. This repo is the alternative, built to be read rather than just run.

---

## The problem, concretely

Rendering one contract overview requires:

| Data | Owned by | Typical latency |
|---|---|---|
| Contract metadata | `documents` | fast |
| Owner name and role | `users` | fast |
| Risk score and findings | `analysis` | **slow, and the one most likely to fail** |

Naively, the client makes three calls and shows a spinner until the slowest returns. If `analysis` is down, the user sees an error page for a contract that is perfectly readable.

This BFF makes one call return one shaped payload, in parallel, and treats a missing analysis as a **degraded response** rather than a failure.

## What it demonstrates

- **Composition** — one client request fans out to N upstream calls concurrently
- **Graceful degradation** — a dead upstream removes a field, it does not fail the request; the response names what is missing in `degraded[]`
- **Circuit breaking** — per-upstream breaker with a sliding failure window and a single-probe half-open state ([implementation](apps/bff/src/http/circuit-breaker.ts), [tests](apps/bff/src/http/circuit-breaker.test.ts))
- **N+1 avoidance** — list hydration batches owner and analysis lookups instead of one call per row
- **Schema validation at the seams** — Zod on both sides of every boundary, so an upstream shape change fails loudly and locally
- **Correlation IDs** — one id follows a request from client through BFF into every upstream log
- **An honest UI** — the client reads `degraded[]` and distinguishes "not analysed yet" from "analysis unavailable", instead of rendering an empty state that reads as good news

## Architecture

```
   ┌──────────┐     ┌─────────────┐
   │   web    │────▶│     BFF     │
   │ (nginx)  │     │   (NestJS)  │
   │  :5173   │     └──────┬──────┘
   └──────────┘            │
       nginx proxies /api  │  parallel, each behind its own breaker
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │documents │ │  users   │ │ analysis │
        │  :4001   │ │  :4002   │ │  :4003   │
        └──────────┘ └──────────┘ └──────────┘
```

The upstreams are real HTTP services in this repo, not mocks in the BFF's test suite. That matters: the resilience behaviour is exercised across an actual network boundary, and you can break them on purpose.

## Watching it degrade

Every upstream honours fault-injection env vars, so the patterns are observable instead of theoretical:

```bash
docker compose up                          # everything healthy

CHAOS_DOWN=true docker compose up analysis # analysis is dead
# → GET /api/contracts/:id/overview still returns 200
#   with analysis: null and degraded: ["analysis"]

CHAOS_LATENCY_MS=3000 docker compose up analysis
# → the BFF times out at 800ms and degrades; after 5 failures
#   the breaker opens and stops waiting altogether
```

## Running it

```bash
pnpm install
pnpm build
docker compose up
```

| Service | URL |
|---|---|
| Web client | http://localhost:5173 |
| BFF | http://localhost:4000 |
| documents / users / analysis | :4001 / :4002 / :4003 |

## Tests

```bash
pnpm test
```

Unit tests cover the resilience primitives with an injected clock — no `setTimeout` in the test suite, so timing behaviour is asserted deterministically. Contract tests check that each upstream still emits what the BFF's schemas expect.

## Stack

TypeScript (strict, `noUncheckedIndexedAccess`) · NestJS · Fastify · Zod · Vitest · Docker Compose · GitHub Actions

## Documentation

- **[Architecture](docs/architecture.md)** — request flow, layering, failure behaviour, and the three states of "no data"
- **[ADR 0001](docs/adr/0001-why-a-bff.md)** — why a BFF, and why not GraphQL
- **[ADR 0002](docs/adr/0002-degrade-per-field.md)** — degrade per field, not per request
- **[ADR 0003](docs/adr/0003-breaker-outside-retries.md)** — why the breaker wraps the retry loop

## Status

Runs end to end with `docker compose up`. Built in the open. See the commit history for how it got here.
