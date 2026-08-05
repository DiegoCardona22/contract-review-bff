# 0002 — Degrade per field, not per request

**Status:** accepted · **Date:** 2026-08-05

## Context

An overview needs a contract, its owner and its risk analysis, from three
services. `analysis` is the slowest and least reliable of the three.

The default behaviour of `Promise.all` — and of most HTTP handlers — is that one
failure fails everything. Applied here, an `analysis` outage returns a 500 for a
contract whose text, counterparty, value and owner all arrived perfectly well.
The user is told nothing is available when almost everything is.

## Decision

Only the contract is required. Owner and analysis are optional: if their
upstream fails, the field is null and the upstream is named in `degraded[]`.
The response stays 200.

`Promise.allSettled` rather than `Promise.all`, because `all` rejects on first
failure and discards the results that did arrive — precisely the data we want
to keep.

## Why `degraded[]` and not just null

`null` alone is ambiguous. A contract with no analysis and a contract whose
analysis service is down produce the same `analysis: null`, but they mean
opposite things: the first is a task nobody has done, the second is a system
that is broken right now.

Without the distinction the UI has to guess, and it will guess wrong in the
dangerous direction — showing "no findings", which reads as *safe*, when the
truth is "we did not look".

## Alternatives considered

**Partial content (206).** Semantically tempting, but 206 is defined for range
requests and clients and proxies treat it accordingly. Overloading it would
break caching intermediaries for no gain.

**Always 200, no degraded field.** Simplest to implement and impossible to use
correctly. The client cannot distinguish absence from failure.

**Fail the request.** Honest, and wrong. It makes reliability of the whole
screen equal to the reliability of its least reliable dependency.

## Consequences

Positive: an `analysis` outage costs one section, not the product. The failure
is visible to the user in the right terms.

Negative: every consumer must handle `degraded[]`, and forgetting to is a silent
bug — the payload still parses. Mitigated by keeping the field required and
non-nullable in the shared schema, so a client that ignores it at least had to
see it in the type.
