# orgmd CLI (0.5.0)

`orgmd` is the 0.5.0 reference implementation for validating, resolving,
checking, scaffolding, and importing ORG.md bundles. It is release-ready in
this repository; no npm package has been published by this release work.

The compiler has two projections, `agents-md` and `prompt`. Both are
**advisory** text: a consumer or runtime must decide how to use them. This
release contains no MCP server, policy gate, handbook renderer, signing, or
hosted service.

## Install

Use Node.js 20 or later. After a maintainer publishes the reviewed release,
install either a tarball or the npm package:

```sh
npm install --global ./orgmd-0.5.0.tgz
npm install --global orgmd@0.5.0
orgmd --version
```

The first command is for a local tarball; the second requires publication.
Until publication, run the repository executable with
`node packages/orgmd/dist/cli/bin.js` after `npm run build`.

## Common behavior

```text
orgmd --help
orgmd --version
```

`--help` lists the command interface and `--version` prints `0.5.0`.

Every command accepts paths relative to the current directory unless an
absolute path is supplied. `validate` and `doctor` load exactly the supplied
bundle (or the current directory). `compile` discovers every ancestor
directory containing `org.md`, from the filesystem root to the supplied path,
and resolves that ordered bundle path. It does not select arbitrary sibling
bundles.

Human-readable diagnostics go to standard error. With `--json`, results go to
standard output as a JSON object with `command`, `ok`, and `diagnostics`; some
commands add data such as generated projections, files, or discovered paths.

Exit status is stable across commands:

| Code | Meaning                                                              |
| ---- | -------------------------------------------------------------------- |
| `0`  | Success (including a clean doctor report).                           |
| `1`  | Semantic validation, resolution, doctor, or adoption failure.        |
| `2`  | Invalid invocation, invalid date, or filesystem/operational failure. |

## `validate`

```text
orgmd validate [path] [--json]
```

Validate a single bundle's Markdown entries, schema, and semantic rules.
Use it before committing a bundle change:

```sh
orgmd validate org
orgmd validate org --json
```

## `compile`

```text
orgmd compile [path] (--target agents-md|prompt | --all) \
  [--clearance a,b] [--today YYYY-MM-DD] [--output path] [--json]
```

Compile a resolved context to an advisory `agents-md` fragment, an advisory
`prompt` block, or both. Exactly one of `--target` and `--all` is required.
`--today` is required and must be a calendar date. `--clearance` is a
comma-separated clearance set and defaults to `public`; it controls what is
emitted after resolution and does not remove policies from the resolved
decision set.

Without `--output`, the projection is written to standard output. With
`--all`, both projections are framed there. `--output` must name an existing
directory; it writes `AGENTS.orgmd.md` and/or `orgmd-prompt.txt` there. Use a
dedicated output directory so a generated projection does not overwrite a
hand-maintained file.

```sh
orgmd compile org --target agents-md --today 2026-08-21
mkdir -p generated
orgmd compile org --all --today 2026-08-21 --output generated
orgmd compile org --target prompt --clearance public,internal --today 2026-08-21 --json
```

Review generated output before placing it in an agent or prompt surface. It is
context, not a runtime access-control mechanism.

## `doctor`

```text
orgmd doctor [path] --today YYYY-MM-DD [--json]
```

Check a bundle for computed maintenance findings, including overdue revisit
dates, orphaned owners, synced entries, missing revisit dates, and source
ratios. `--today` is required so results are reproducible. Findings return
exit status `1`; warnings are still actionable and should be reviewed.

```sh
orgmd doctor org --today 2026-08-21
orgmd doctor org --today 2026-08-21 --json
```

## `init`

```text
orgmd init [path] --non-interactive --organization NAME --tone TEXT \
  --policy TEXT --action ACTION --effect allow|escalate|deny \
  --editor ROLE --owner ROLE --revisit YYYY-MM-DD --today YYYY-MM-DD \
  [--terms a,b] [--route ROLE] [--write] [--preview] [--overwrite] [--json]
```

Create a minimal Core-shaped bundle. The current CLI is deliberately
non-prompting, so `--non-interactive` and every required value above are
mandatory. `--terms` accepts a comma-separated list of disputed terms.
`--route` is required when `--effect escalate` is selected.

The safe default is preview: without `--write` (or with `--preview`) the
three proposed files are printed and nothing changes. After review, repeat
the same command with `--write`. `--overwrite` permits replacing existing
scaffold files only when writing; use it only after confirming the target.

```sh
orgmd init example-org --non-interactive \
  --organization "Example Org" --tone "plain and cautious" \
  --terms "customer,approved" --policy "Do not publish customer data." \
  --action data.customer.publish --effect deny --editor role.editor \
  --owner role.security --revisit 2027-01-01 --today 2026-08-21

orgmd init example-org --non-interactive \
  --organization "Example Org" --tone "plain and cautious" \
  --terms "customer,approved" --policy "Do not publish customer data." \
  --action data.customer.publish --effect deny --editor role.editor \
  --owner role.security --revisit 2027-01-01 --today 2026-08-21 --write
```

Run `orgmd validate example-org` and `orgmd doctor example-org --today
2026-08-21` after writing.

## `adopt`

```text
orgmd adopt <source> [path] [--write --confirm candidate.field=value] [--json]
```

Turn Markdown from an existing instruction surface into draft candidates.
The first invocation is always a preview: it reads `<source>`, reports the
candidate IDs and required fields, and does not change the target. Adoption
does not infer ownership, scope, or policy fields that need a human decision.

Writing requires an explicit existing, non-symlink target bundle, `--write`,
and one or more exact confirmations from that preview. Repeat `--confirm` for
each required `candidate.field=value` value, then inspect the resulting draft
entries and ratify them through the normal review process.

```sh
orgmd adopt ./AGENTS.md ./org
orgmd adopt ./AGENTS.md ./org --write \
  --confirm candidate-id.domain=glossary \
  --confirm candidate-id.owner=role.editor \
  --confirm candidate-id.scope=public
```

Replace `candidate-id` with an ID printed by the preview; a preview digest
binds confirmations to the reviewed candidate set. Never use the write form
until the preview and every supplied value have been reviewed.

## Safety and limits

For output and scaffold writes, the CLI rejects traversal segments and
symbolic links in the target path, uses same-directory atomic writes, and
refuses existing files unless an explicit overwrite flow permits them.
Bundle traversal canonicalizes paths and rejects a discovered path that
resolves outside the bundle root. These checks do not make an untrusted bundle
safe to execute: run the CLI with least filesystem privilege and review the
advisory projections before delivery.

The parser limits each content file to 16 MiB, 10,000 entries, and YAML alias
expansion of 100 aliases. There is no total-bundle, directory-depth, or CPU
budget in 0.5.0; do not run it over untrusted trees without an external
resource limit.
