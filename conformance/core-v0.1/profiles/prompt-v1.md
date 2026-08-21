# orgmd-prompt-v1

This is the version 1 advisory profile for plain prompt blocks. It renders only
a successful `ResolvedContext` and is never canonical source.

The envelope is exactly:

```text
[ORG.md advisory context]
profile: orgmd-prompt-v1
context: <context-id>
bundles: <bundle-id>=<content-id>[, ...]

<domain sections>
[end ORG.md advisory context]
```

It uses the identical domain, entry, contested/stale, withheld, ordering,
opaque-body, LF, and terminal-LF rules published by `orgmd-agents-md-v1`.
