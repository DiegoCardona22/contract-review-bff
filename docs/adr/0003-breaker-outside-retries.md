# 0003 — Circuit breaker wraps the retry loop

**Status:** accepted · **Date:** 2026-08-05

## Context

Every outbound call needs both retries (for transient blips) and a circuit
breaker (for sustained outages). They compose in two possible orders, and the
choice is not cosmetic.

## Decision

    breaker → [ retry → timeout → fetch ]

The breaker is outermost. One logical call — however many HTTP attempts it made
internally — counts as exactly one success or one failure.

## Why not the inverse

With the breaker inside the retry loop:

1. A single flaky request that retries three times registers three failures.
   With a threshold of five, two unlucky requests trip a circuit on an upstream
   that is basically healthy.
2. Worse, when the upstream *is* down, the retry loop keeps running. The breaker
   opens, the retry catches the `CircuitOpenError`, waits, and tries again —
   turning the protection into a busy-wait against a service already on fire.

The second point is the serious one: it inverts the purpose of the breaker,
which exists to *remove* load from a struggling dependency.

## Consequences

A call that exhausts its retries takes `maxRetries × timeout` plus backoff
before the breaker learns anything. With the defaults here that is under two
seconds, which is acceptable — but it means the failure threshold counts slow
events, so the sliding window must be wide enough to actually accumulate them.

`resilient-client.test.ts` pins both properties: one exhausted chain leaves the
circuit closed, and an open circuit issues no fetch at all.
