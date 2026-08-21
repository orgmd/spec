# orgmd-agents-md-v1

This is the version 1 advisory profile for generated AGENTS.md fragments.
It renders only a successful `ResolvedContext` and is never canonical source.

The envelope is exactly:

```md
<!-- orgmd:begin profile=orgmd-agents-md-v1 advisory=true context=<context-id> -->
<!-- bundles: <bundle-id>=<content-id>[, ...] -->
## Organisational context (advisory)

<domain sections>
<!-- orgmd:end -->
```

Bundle versions keep their root-to-leaf resolution order. Domain sections use
`### Identity`, `### Glossary`, `### Decision`, `### Policy`, `### Ownership`,
and `### Done` in that order when present; custom domain names follow in UTF-8
byte order. Entries within a domain are sorted by UTF-8 byte order of ID and
have this exact shape:

```md
#### `<id>`
owner: `<owner>`
scope: `<scope>`
source: `<source>`
revision: `<rev>`
action: `<action>`
effect: `<effect>`
route: `<route>`
CONTESTED — reliance requires escalation
STALE (<reason>[, <reason>...]) — reliance requires escalation

<body>
```

The `action`, `effect`, `route`, contested, and stale lines appear only when
their resolved values apply. Stale reasons are UTF-8-byte sorted. Entry bodies
are opaque and retain their Markdown. If any Mode A values are withheld, the
final section has the fixed shape `### Withheld`, a blank line, then
`Withheld entries: <count> (clearance).`; it exposes no hidden identifier,
scope, action, owner, or body information. The emitted bytes always use LF
line endings and exactly one terminal LF.
