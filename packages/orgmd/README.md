# orgmd

`orgmd` validates, resolves, and compiles versioned ORG.md organisation
bundles. It ships as an ESM library and the `orgmd` command-line executable.

## Install

```sh
npm install orgmd
```

## Use

```sh
orgmd validate org
orgmd doctor org --today 2026-08-21
orgmd compile org --all --today 2026-08-21
```

The package exports the library API, the entry schema at `orgmd/schema`, and
the Core conformance manifest at `orgmd/conformance/manifest`.

## License

Apache-2.0. See [LICENSE](./LICENSE).
