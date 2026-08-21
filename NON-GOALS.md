# Non-goals

This document is normative by reference from SPEC §1. Its job is to keep
the standard small enough to freeze, implement, and trust. Proposals that
reopen these need extraordinary evidence, not enthusiasm.

**ORG.md will never be:**

1. **A knowledge base or wiki.** The bundle records operative meaning that
   passes the admission test — not documentation in general. Your wiki
   stays your wiki; adapters sync *from* it.
2. **A RAG or retrieval system.** Retrieval answers "what's relevant?";
   ORG.md answers "what's canonical?". Complements, never competitors.
3. **An agent framework or orchestrator.** No runtime, no planning, no
   tool execution beyond the gate's four read-only-plus-verdict tools.
4. **A data catalog or schema registry.** Business meaning, not data
   lineage. Point at your catalog with `ref:`.
5. **An identity, key, or logging system.** Scopes resolve to *your* IdP,
   keys live in *your* KMS, events flow to *your* SIEM. This is
   load-bearing for trust: primitives we don't build are primitives you
   don't have to audit.
6. **A compliance certification.** Bundles generate evidence that maps to
   ISO 42001 / NIST AI RMF expectations; they do not constitute
   certification, and no document in this project may claim otherwise.
7. **A hosted service you must use.** Any registry or hosting is optional
   convenience atop the open format. A git repo is always a complete,
   conformant home for a bundle.
8. **A place to write strategy.** The write-doctrine (SPEC §9) is not a
   suggestion. Rationale lives in your systems under your retention rules;
   the bundle carries what consumers need to act, and no more.
9. **An ontology language.** The entry model defines no typed
   relationships between entries beyond `ref:` and supersession. The
   Semantic Web proved that expressive relational meaning (RDF/OWL) dies
   of authoring and maintenance costs inside real organisations; what
   survived that era was the small, flat subset. Proposals adding
   relation types reopen that failure and require constitutional
   amendment, not just an RFC.

If a proposal genuinely doesn't fit this list or the spec, the answer is
usually a separate project that consumes ORG.md — and that's a
compliment, not a rejection.
