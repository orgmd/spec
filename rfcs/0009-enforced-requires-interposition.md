# RFC 0009 — `enforced` requires interposition

- **Status:** accepted
- **Author:** Matt (BoundFor Ltd)
- **Opened:** 2026-08-21
- **Comment period ends:** 2026-09-04
- **Resolves:** orgmd/spec#4

## Motivation

SPEC §6.1 requires compilers to label each target **advisory** or
**enforced**. §6.2 defines advisory targets and forbids claiming enforcement
where only advisory targets are deployed. §6.3 then presents "the enforced
target — the gate", which is an MCP server exposing four tools.

Nothing in the specification says what `enforced` requires beyond the gate
existing. An MCP server is a set of tools an agent *may* call. An agent that
does not call `org.policy` is not stopped by `org.policy`. If the only thing
standing between the agent and the action is the agent's willingness to ask,
the gate binds exactly as much as a paragraph in a system prompt — which
§6.2 correctly calls advisory.

So the specification currently permits a deployment to be labelled `enforced`
on the strength of a property it does not have, and SECURITY §3 states
"Prompts advise; the gate enforces" as though the distinction were
structural. It is not, yet. The word `enforced` is the strongest claim this
project makes, and it is the one claim with no stated requirement behind it.

This is not an argument against the gate. Deterministic verdicts are necessary
for enforcement. They are not sufficient. What is missing is the requirement
that something *asks the gate on the agent's behalf, whether or not the agent
wants it to*.

## Design

### 1. Definition

**Interposition.** A verdict is **interposed** for an action when the verdict
is obtained and applied by a component that lies in the execution path of that
action, and that the consuming agent cannot bypass, disable, decline to
invoke, or supply a forged answer to.

**Enforcement point.** The interposing component. It is not part of ORG.md and
this specification defines none; it is the deployment's own control plane.

### 2. The rule

- A deployment MAY label a projection target `enforced` only where every
  action in that target's declared action set is interposed, as defined
  above.
- Where any action in the target's action set is not interposed, the target
  MUST be labelled `advisory`.
- Implementations MUST NOT label a target `enforced` on the basis that a §6.3
  gate is deployed, reachable, or configured. Availability of a verdict is not
  application of a verdict.
- A deployment claiming `enforced` MUST record, per target, an
  **enforcement-point declaration** carrying at minimum: the kind of
  enforcement point, an identifier for it, and the action set it interposes.
  Projections labelled `enforced` MUST carry this declaration or a reference
  to it.
- Where an enforcement point interposes only part of a target's action set,
  the deployment MUST either split the target or label the whole target
  `advisory`. Partial interposition MUST NOT be labelled `enforced` with a
  caveat; the label is read by machines and by procurement, and both read it
  as a whole.
- Documentation, marketing material, and generated projections MUST NOT
  describe an uninterposed gate as enforcing, preventing, blocking, or
  guaranteeing. This extends §6.2's existing prohibition from "no gate" to
  "no interposition", which was always the intended meaning.

### 3. What counts

Non-exhaustive examples of interposition:

- A tool-call proxy or broker through which all of the agent's tool traffic
  passes, which consults the gate and refuses denied calls.
- A policy enforcement point evaluating a policy compiled from the bundle —
  OPA or Cedar per DEC-0006 — sited in the service the action targets.
- An API gateway, service mesh filter, or network egress control applying the
  compiled policy.
- A CI admission check or repository ruleset that blocks a denied change,
  where the agent cannot merge without passing it.
- A human approval step that the action cannot proceed without, for actions
  whose verdict is `escalate`.

Non-exhaustive examples that are **not** interposition, and MUST be labelled
advisory:

- An MCP gate the agent is instructed, prompted, or trained to call.
- A system prompt, AGENTS.md fragment, skill, or tool description telling the
  agent to check policy first.
- The agent's own pre-flight self-check, or a framework middleware running
  inside the agent's own trust boundary and disableable from it.
- A gate whose verdict the agent receives and is expected to honour, where the
  action is executed by a path that never sees the verdict.
- A linter, reviewer, or monitor that observes after the fact. Detection is
  valuable and is not enforcement.

### 4. Escalate and enforcement

For an interposed `escalate` verdict, the enforcement point MUST suspend the
action until the escalation is resolved through the entry's `route`. An
enforcement point that logs an escalation and permits the action has applied
`allow`; the deployment MUST NOT describe that behaviour as enforcing
`escalate`.

### 5. Honest labelling under partial deployment

Most real deployments will be advisory for most actions and enforced for a
few. That is a normal and respectable state, and the specification should make
it easy to describe rather than embarrassing to admit. Implementations SHOULD
report enforcement coverage — the proportion of an agent's action set that is
interposed — as a deployment health signal alongside the synced-to-native
ratio (§4.3) and drift findings (§10).

## Alternatives considered

**Do nothing.** Rejected: `enforced` is the project's strongest claim and
currently binds nothing. Leaving it undefined invites vendors to ship an MCP
server and a compliance slide, which discredits the standard's one hard
guarantee.

**Specify the enforcement point in ORG.md.** Rejected: NON-GOALS #3 (no agent
framework, no orchestrator, no tool execution beyond the gate's four tools)
and #5 (no identity or infrastructure of our own). The specification can state
a requirement on the deployment without building the mechanism, exactly as it
does for keys, identity, and audit.

**Drop `enforced` and label everything advisory.** Rejected: it discards the
useful distinction and gives organisations no vocabulary for the deployments
that *do* interpose. The word is worth keeping if it is worth earning.

**Rename to `enforceable`.** Rejected as worse: it is a property of the
verdict, not of the deployment, and the reader who most needs the distinction
would not notice the suffix.

**Make interposition a SHOULD.** Rejected: a SHOULD on the definition of a
label makes the label meaningless, because a non-interposing deployment could
still conformantly use it.

**Require an attestation signed by the enforcement point.** Considered and
deferred. The declaration in §2 is a claim, not proof, and a signed
attestation bound to the deployment's identity would be stronger. It needs the
`org.lock`/TUF work (§7) to land first and belongs in a follow-up RFC once
there is a deployment to attest.

## Conformance impact

**Core.** §6.2's labelling prohibition is tightened; Core deployments will
almost always be `advisory`, which is already the expectation.

**Extended.** §6.3 gains the enforcement-point declaration for any target
labelled `enforced`. An Extended implementation that deploys the gate without
interposition remains Extended-conformant — the gate's determinism is what
Extended tests — but MUST label its targets `advisory`. The conformance level
and the enforcement label are independent axes and the spec should say so.

**Full.** Unchanged, except that audit events (§8) SHOULD record whether the
verdict was interposed, so an auditor can distinguish a consulted verdict from
an applied one.

**Bench tests to add:**

- `enforce/bypass-test` (agent track, deployment-level) — the harness performs
  a denied action *without* calling `org.policy`. A deployment claiming
  `enforced` for that action set MUST see the action blocked. A deployment
  claiming `advisory` is not tested and does not fail.
- `enforce/escalate-suspends` — an interposed `escalate` does not complete
  until routed.
- `enforce/declaration-present` — a target labelled `enforced` carries an
  enforcement-point declaration naming its action set.
- `enforce/partial-coverage-labelled-advisory` — a target with one
  uninterposed action in its set cannot be labelled `enforced`.
- `enforce/label-in-projection` (resolver) — every compiled projection carries
  its label, and `enforced` carries the declaration reference.

The bypass test is the substantive one. It is also the test that cannot be
passed by writing prose, which is the point.

## Constitution check

No amendment required.

- **Principle 7** (ORG.md describes meaning; other systems execute work) is
  the reason interposition is a requirement on the deployment rather than a
  component of the standard. This RFC stays on the correct side of that line:
  it says what must be true, not what must be built.
- **Principle 6** (security primitives are borrowed, never rebuilt) is served:
  proxies, PEPs, gateways and admission controllers already exist and are
  audited. DEC-0006's OPA/Cedar compile targets are exactly the path to a real
  enforcement point.
- **Principle 8** (unknown authority escalates): §4 above makes an interposed
  `escalate` actually suspend, which is what the principle means in practice.
- **Principle 11** (vendor neutrality): the examples name categories and two
  open policy engines already cited in DEC-0006; no vendor is required.
- **NON-GOALS #3 and #5** are respected: nothing here obliges the project to
  ship a runtime, a proxy, or an execution path.
- **NON-GOALS #6** (not a compliance certification) is reinforced: a stricter
  definition of `enforced` is what keeps generated evidence honest.

## Decision

Accepted 2026-08-21 by the editor under BDFL authority (DEC-0002); the
comment period was waived by the editor's explicit direction. Recorded as
`org/decisions/DEC-0016.md` (dec.0016). Normative text landed in SPEC.md
0.3-draft via PR #16.
