# RFC 0003 — The entry container: a published file grammar

- **Status:** accepted
- **Author:** Matt (BoundFor Ltd)
- **Opened:** 2026-08-21
- **Comment period ends:** 2026-09-04
- **Resolves:** orgmd/spec#11

## Motivation

SPEC §3 says only:

> All content files are Markdown with YAML front-matter, readable by a
> human with no tooling.

Singular front-matter, one entry per file. The project's own bundle does
something else. `org/glossary.md` packs five entries into one file, and
`org/policies.md` three, each separated by a bare `---` line. AGENT-BRIEF
§1 instructs the reference implementation to parse

> multiple entries per file separated by `---` blocks (see
> `org/glossary.md`)

which the specification does not describe at all. The format the project
ships is not the format the spec publishes.

The separator is also ambiguous with Markdown itself. A bare `---` line is
a CommonMark thematic break; under a line of text it is a setext level-2
heading; inside a fenced code block it is content. An entry body
containing any of these parses differently in two implementations, and a
resolver that splits differently produces different effective context —
so §11's identical-output guarantee fails on a file a human wrote
correctly as Markdown.

A concrete failure: a decision entry whose body quotes a YAML fragment in
a fenced block will, under a naive splitter, become two entries, the
second with an unparseable front-matter block. The bundle validates on one
tool and errors on another.

## Design

Replace the final paragraph of SPEC §3 with the text below, keeping the
first two paragraphs and the layout diagram unchanged.

`org.md` is the only REQUIRED file. A bundle containing only `org.md` and
one meaning file is valid.

### 3.1 Content file grammar

A **content file** is a UTF-8 encoded sequence of one or more **entry
records**. Files are Markdown, readable by a human with no tooling.

```abnf
content-file  = [ BOM ] entry-record *( blank-line entry-record )
entry-record  = delimiter LF yaml-block delimiter LF [ body ]
delimiter     = "---"          ; exactly three HYPHEN-MINUS, alone on the line
blank-line    = *WSP LF
```

Normatively:

- A content file MUST begin with a delimiter line, optionally preceded by
  a UTF-8 byte order mark. A file that does not is not a content file: it
  contains no entries and MUST be ignored, with a warning (§3's
  ignore-unknown-files rule).
- A **delimiter line** is a line whose entire content is exactly the three
  characters `---`, with no leading whitespace and no trailing characters
  other than the line ending. A line of four or more hyphens is never a
  delimiter.
- Line endings MAY be LF or CRLF. Implementations MUST accept both and
  MUST normalise to LF before hashing (§7).
- The **front-matter block** is the text between the first two delimiter
  lines of a record. It MUST be a YAML 1.2 mapping. Duplicate keys are a
  validation error. Implementations MUST ignore unknown keys.
- The **body** is every line after the record's closing delimiter, up to
  but not including the next record's opening delimiter, or end of file.
  Leading and trailing blank lines of a body are not part of it.
- After the first record, an opening delimiter MUST be preceded by a blank
  line. A delimiter line not preceded by a blank line therefore never
  starts a record — which is what makes a setext level-2 heading
  (`Text` on one line, `---` on the next) unambiguous.
- When scanning for the next opening delimiter, implementations MUST track
  CommonMark fenced code blocks (backtick and tilde fences) and MUST NOT
  treat any line inside an open fence as a delimiter.
- Outside a fence, a body line that would be read as an opening delimiter
  — a `---` line preceded by a blank line — **is** an opening delimiter.
  It is not escapable. A body that needs a thematic break MUST use `***`
  or `___`, both of which CommonMark renders identically and neither of
  which the container reads. Where the resulting front-matter block is not
  a valid YAML mapping, the file is invalid and the error MUST name the
  line number of the offending delimiter and state this rule.
- The entry's `id` (§4) identifies it; position in the file carries no
  meaning. Implementations MUST NOT depend on entry order within a file,
  and MUST process files within a bundle in an order that does not affect
  output (§11).

A file MAY hold one entry or many. One entry per file is RECOMMENDED for
`decisions/`, where MADR conventions apply (§4.4); many entries per file
is RECOMMENDED for `glossary.md`, `policies.md`, `ownership.md` and
`done.md`, where an entry is a sentence or two and one file per term
would be hostile to a human reader.

### 3.2 Example

```markdown
---
id: term.bundle
owner: role.editor
scope: public
status: approved
source: native
---
**bundle** — a directory tree conforming to §3, attached to one node.

---
id: term.entry
owner: role.editor
scope: public
status: approved
source: native
---
**entry** — one unit of meaning with the §4 fields.
```

## Alternatives considered

**Do nothing.** The published spec describes one format and the reference
bundle uses another; every implementer reverse-engineers the splitter from
`org/glossary.md`. Rejected as the direct cause of #11.

**One entry per file, no container.** Removes the ambiguity completely and
matches the literal reading of today's §3. Rejected: a 40-term glossary
becomes 40 files, which defeats "readable by a human with no tooling" and
would force a rewrite of the project's own bundle in the direction of
worse. It also makes review diffs harder, not easier.

**Lookahead disambiguation** — treat `---` as a delimiter only if a
closing `---` follows within N lines with a parseable YAML mapping
between. Tolerates thematic breaks in bodies. Rejected: the parse of line
*k* then depends on lines far below it, two implementations will bound the
lookahead differently, and a body containing a YAML example becomes an
entry. Determinism beats tolerance here; the resolver is trusted-base code
and must be auditable in an afternoon.

**A distinct separator** (`+++`, `===`, or a `<!-- entry -->` comment).
Unambiguous, but abandons the Jekyll/Hugo/Obsidian front-matter convention
every Markdown tool already renders, and would break the project's own
bundle for no semantic gain. Rejected under DEC-0006: the convention is
the mature option.

**YAML multi-document streams** (`---`-separated documents, entries as
YAML with a `body:` string). Formally clean and already standardised.
Rejected: the body stops being Markdown a human edits and becomes a quoted
scalar, which is exactly the authoring cost that killed the Semantic Web
approach the README calls out.

## Conformance impact

**Core.** §3 gains a grammar; parsers must implement fence tracking and
the blank-line rule. `orgmd validate` gains three error classes:
non-content file, invalid front-matter block, delimiter inside a body.

Bench tests to add (resolver track — parser fixtures):

1. `container-single` — one entry, one file.
2. `container-multi` — the §3.2 example → exactly two entries.
3. `container-no-leading-delimiter` — file ignored with warning, not an
   error.
4. `container-setext` — body containing `Heading` followed by `---` with
   no blank line before it → one entry, heading preserved.
5. `container-fence` — body containing a fenced block that contains a
   `---` line preceded by a blank line → one entry.
6. `container-thematic-break` — body with a blank line then `---` →
   invalid file, error names the line and the `***` remedy.
7. `container-long-rule` — body containing `----` → one entry.
8. `container-crlf` — CRLF file resolves byte-identically to its LF twin.
9. `container-duplicate-key` — duplicate YAML key → validation error.
10. `container-order-independence` — the same entries in two orders in
    one file → identical effective context.

**Extended.** §7 hashing is defined over normalised line endings, so
`org.lock` manifests are stable across checkouts with different git
autocrlf settings.

**Full.** No change.

## Constitution check

No amendment needed.

- **1 — humans and machines are first-class consumers.** The grammar is
  chosen so a glossary stays one readable file for the human and one
  deterministic parse for the machine.
- **6 — primitives borrowed, never rebuilt.** YAML front-matter and
  CommonMark fence rules are both borrowed as-is; the RFC adds only the
  blank-line separation rule.
- **10 — conformance is behavioural.** A published grammar is what makes
  byte-identical parses testable rather than asserted.
- **DEC-0006 — profile, don't invent** is the reason a bespoke separator
  is rejected.

## Decision

Accepted 2026-08-21 by the editor under BDFL authority (DEC-0002); the
comment period was waived by the editor's explicit direction. Recorded as
`org/decisions/DEC-0010.md` (dec.0010). Normative text landed in SPEC.md
0.3-draft via PR #16.
