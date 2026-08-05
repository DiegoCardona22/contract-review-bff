# 0001 — Introduce a Backend-for-Frontend

**Status:** accepted · **Date:** 2026-08-05

## Context

The contract review UI needs data from four services. Today the browser calls
each one directly. That produces four round trips on a screen that should feel
instant, forces every service to publish CORS rules for the web origin, and
couples the UI to the internal shape of each service — a field rename in
`analysis` breaks the frontend build.

The failure behaviour is the worst part: `analysis` is the slowest and least
reliable upstream, and today its outage renders a whole contract unreadable
even though the document itself is available.

## Decision

Introduce a BFF owned by the frontend team. It exposes endpoints shaped around
screens rather than entities, fans out to upstreams concurrently, and degrades
per-field instead of per-request.

## Alternatives considered

**GraphQL gateway.** Solves over-fetching well, and federation would fit the
service split. Rejected because the client needs are few and stable — three
screens — and a gateway adds a schema registry, query-cost analysis and a
caching story we do not need yet. The BFF can become one later without the
client changing.

**API gateway with response aggregation.** Aggregation in a generic gateway is
configuration, not code: hard to test, hard to express "return partial data
when analysis is down". Composition logic deserves a type system.

**Leave it in the client.** Cheapest today. Rejected because the fan-out cost
is paid on the user's network, and every new client — the React Native app is
next — reimplements the same orchestration.

## Consequences

Positive: one round trip per screen, upstream shapes hidden behind a validated
boundary, one place to add caching and resilience.

Negative: a new deployable in the critical path, and a real risk of the BFF
turning into a shared backend if other teams start adding endpoints. Mitigated
by the ownership rule — the team that owns the client owns the BFF, and
anything reused by a second client belongs in a service instead.
