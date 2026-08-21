# Contributing

Thank you — a standard is only as good as the counterexamples it survives.

## The fastest ways to help right now

1. **Bring a counterexample.** An org shape, industry, or agent setup where
   the entry model or resolution rules break. File it as an issue with a
   concrete scenario.
2. **Draft a bundle for your org** (redacted is fine) and tell us where the
   format fought you.
3. **Add bench tasks.** Especially: vocabulary traps from your industry,
   policy-adherence probes, and leakage attempts.
4. **Write an adapter** for a system of record people actually use.

## Ground rules

- **DCO, not CLA.** Sign your commits (`git commit -s`). That's the whole
  legal ceremony.
- **Which repo, which bar:**
  - `spec` — changes only via the RFC process (GOVERNANCE.md). PRs that
    edit normative text without an accepted RFC will be closed kindly and
    pointed there.
  - `orgmd` — normal review; keep PRs small; tests required.
  - `bench` — CI green and a one-line description of what behaviour the
    task probes.
- **Scope is enforced.** Read NON-GOALS.md before proposing features. "It
  would also be cool if…" PRs get one link and a close.
- **Small on purpose applies to the project too.** The best PR deletes
  prose from the spec without deleting meaning.

## Issue etiquette

- Problems over solutions in first posts — the RFC is where solutions go.
- Real examples beat hypotheticals; redact freely.
- Security-relevant reports go to SECURITY.md's channel, never the public
  tracker.

## Style

- Spec text: RFC 2119 keywords, short sentences, no marketing.
- Code: boring and readable wins. The compiler must be auditable by a
  security reviewer in an afternoon — cleverness is a cost.

## Recognition

Sustained contributors are offered maintainer rights on `orgmd`/`bench`.
The spec has one editor until v1.0 (GOVERNANCE.md explains why, and when
that ends).
