# AGENT-BRIEF.md — first build

You are building the ORG.md reference implementation (`orgmd`) in this
repository. Read, in order, before writing any code: `README.md`,
`SPEC.md`, `NON-GOALS.md`, `GOVERNANCE.md` (the constitution), and this
file. The spec is the contract; this brief is the sequence.

## Rules that outrank everything else

1. **Do not touch normative text.** `SPEC.md`, `NON-GOALS.md`, and the
   constitution change only via RFC. If the spec is wrong or ambiguous,
   open an issue using the "RFC proposal" template and build to the most
   conservative reading.
2. **`org/` is this project's own bundle.** Your tooling must run against
   it from day one — that's the first test fixture. Any change to `org/`
   needs owner, scope, status, source (SPEC §4) and goes through a PR.
3. **Boring beats clever.** A security reviewer must be able to audit the
   resolver in an afternoon. No metaprogramming, no plugin magic yet.
4. **Zero inference cost in v0.5.** Nothing in this build calls a model.
   Compile is deterministic text generation.
5. **Nothing from NON-GOALS.md.** No retrieval, no workflow, no auth, no
   log store, no ontology. If you're tempted, it's a separate project.

## Stack

TypeScript, Node 20+, single package `orgmd`, published later via `npx`.
Vitest for tests. No framework for the CLI beyond a light arg parser. Keep
the dependency list short enough to read aloud.

## Build sequence (v0.5 — do these in order, each with tests)

### 1. Entry model + JSON Schema
- Parse Markdown files with YAML front-matter; multiple entries per file
  separated by `---` blocks (see `org/glossary.md`).
- Publish `schema/entry.schema.json` matching SPEC §4: required
  `id, owner, scope, status, source`; optional `revisit, ref, not`;
  `status ∈ {draft, approved, contested, superseded}`;
  `source` matches `native` or `synced:<system>`.
- `orgmd validate <path>` — validates every entry, human-readable errors.
- **Test fixture:** `org/` must validate clean.

### 2. Resolver (the trusted base — tests before features)
- Input: an ordered node path of bundle directories (root → leaf), a
  clearance level, and a scope ordering (`public < internal < restricted`).
- Output: effective context per SPEC §5 —
  definitions with the same `id`: closest wins;
  constraints: all apply, and a closer same-`id` constraint must narrow
  (for now, "narrow" = the closer entry declares `narrows: <parent id>`
  or is identical; anything else is a resolution error — document this
  simplification and open an issue for the RFC on narrowing semantics);
  scope filtering before emission; withheld markers; contested
  propagation; superseded and draft never emitted (drafts only with
  `--include-drafts`).
- Emit the bundle versions resolved from (git short SHA of each dir if
  available; else content hash).
- **Property to defend in tests:** same tree + identity + clearance ⇒
  identical output, byte for byte. This is the resolver-conformance
  guarantee (SPEC §11).

### 3. Compiler — two advisory targets only
- `orgmd compile --target agents-md` → a delimited, generated section
  (`<!-- orgmd:begin v=... -->` … `<!-- orgmd:end -->`) suitable for
  insertion into an AGENTS.md / CLAUDE.md, marked **advisory**.
- `orgmd compile --target prompt` → a plain system-prompt block, marked
  **advisory**.
- Both consume resolver output, never raw bundles. Both print the versions
  they were resolved from. Contested entries are visibly marked.
- No MCP gate, no handbook renderer in this build.

### 4. `orgmd doctor` — computed staleness
- Flags: `revisit` in the past; `owner` not present in `ownership.md`
  (orphan); `synced:` entries (report only — adapters don't exist yet);
  entries missing `revisit`.
- Output is a list a human can act on. Exit non-zero on findings so CI can
  gate on it.

### 5. `orgmd init` — interview-style scaffold
- Asks: org name, tone, the ~10 words people argue about, one policy
  agents must not break, who owns each. Writes a Core-conformant bundle.
- Must produce something `orgmd validate` and `orgmd doctor` accept.

### 6. CI
- GitHub Action: on PR and push, run `validate` and `doctor` against
  `org/`, run tests. Fail the build on either.

## Deliverables checklist for the PR that closes v0.5

- [ ] `packages/orgmd/` with the five commands and tests
- [ ] `schema/entry.schema.json`
- [ ] `org/` validates and doctors clean in CI
- [ ] `docs/cli.md` — one page, examples for each command
- [ ] Issues opened for every simplification you made (narrowing
      semantics at minimum)
- [ ] `CHANGELOG.md` updated under a `0.5.0` heading

## Explicitly out of scope for this build

MCP gate · handbook target · adapters · `org.lock` signing · Desk UI ·
bench harness · anything hosted. These are v0.6+ (see ROADMAP.md) and
several are gated on evidence, not on your keyboard.

## When you finish

Open the PR with the checklist above and a one-paragraph note per
component that a security reviewer could read cold. Then stop. Do not
start v0.6.
