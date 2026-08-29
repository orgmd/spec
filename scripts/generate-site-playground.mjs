import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ORGMD_VERSION,
  compileContext,
  doctorBundle,
  doctorExitCode,
  resolveContext,
  validateBundlePath,
} from "../packages/orgmd/dist/index.js";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDirectory = resolve(repository, "site/playground/fixtures");
const outputPath = resolve(repository, "site/playground/results.json");
const today = "2026-08-21";
const clearance = Object.freeze(["public"]);
const implementationCommit = "6e1978f180b6d0e3371023ee30a2621c35992561";
const expectedImplementationDigest =
  "sha256:3fe6ef3a137ded01a0e04378efba9c7c525afa605e51fedaa0de6856a4d32b92";
const implementationRoots = Object.freeze([
  "package-lock.json",
  "packages/orgmd/package.json",
  "packages/orgmd/src",
  "packages/orgmd/tsconfig.json",
  "schema/entry.schema.json",
  "scripts/copy-package-assets.mjs",
  "tsconfig.json",
]);
const states = Object.freeze([
  Object.freeze({
    id: "current",
    label: "Current approved meaning",
    summary: "Revision 1 is approved and effective.",
    expectedRevision: 1,
    expectedPending: 0,
  }),
  Object.freeze({
    id: "draft",
    label: "Draft proposed",
    summary:
      "Revision 2 validates but remains unratified. Revision 1 is still effective.",
    expectedRevision: 1,
    expectedPending: 1,
  }),
  Object.freeze({
    id: "ratified",
    label: "Recorded after ratification",
    summary:
      "Recorded post-ratification snapshot. Revision 2 is now effective.",
    expectedRevision: 2,
    expectedPending: 0,
  }),
]);

const mode = process.argv.slice(2);
if (mode.length !== 1 || (mode[0] !== "--write" && mode[0] !== "--check")) {
  throw new Error(
    "Usage: node scripts/generate-site-playground.mjs --write|--check",
  );
}

const generated = `${JSON.stringify(await generate(), null, 2)}\n`;
if (mode[0] === "--write") {
  await writeFile(outputPath, generated, "utf8");
  process.stdout.write("playground: generated site/playground/results.json\n");
} else {
  const committed = await readFile(outputPath, "utf8");
  if (committed !== generated) {
    process.stderr.write(
      "playground: generated results differ; run npm run site:playground:generate\n",
    );
    process.exitCode = 1;
  } else {
    process.stdout.write("playground: generated results are current\n");
  }
}

async function generate() {
  const implementationDigest = await digestImplementation();
  if (implementationDigest !== expectedImplementationDigest) {
    throw new Error(
      "The v0.5 implementation no longer matches the pinned public-demo provenance. Review the implementation change and update the commit and digest intentionally.",
    );
  }
  const generatedStates = {};
  const aggregateInputs = [];
  for (const state of states) {
    const fixturePath = resolve(fixturesDirectory, state.id);
    const files = await readFixtureFiles(fixturePath);
    for (const file of files) {
      aggregateInputs.push(`${state.id}\0${file.path}\0${file.sha256}`);
    }
    generatedStates[state.id] = await generateState(state, fixturePath, files);
  }

  assertScenarioMatrix(generatedStates);

  return Object.freeze({
    schemaVersion: 1,
    demo: Object.freeze({
      id: "kowhai-freight-escalation",
      title: "See a draft wait until it is ratified",
      today,
      clearance,
      stateOrder: states.map(({ id }) => id),
    }),
    provenance: Object.freeze({
      orgmdVersion: ORGMD_VERSION,
      specVersion: "0.3.1-draft",
      implementationCommit,
      implementationDigest,
      fixtureDigest: sha256(aggregateInputs.sort().join("\n")),
    }),
    states: Object.freeze(generatedStates),
  });
}

async function generateState(state, fixturePath, files) {
  const validation = await validateBundlePath(fixturePath, {
    isRoot: true,
    nodePath: "kowhai-freight",
  });
  if (!validation.value) {
    throw new Error(
      `${state.id}: fixture did not validate: ${JSON.stringify(validation.diagnostics)}`,
    );
  }

  const resolution = resolveContext({
    path: [validation.value],
    clearance,
    today,
  });
  if (!resolution.value || resolution.value.resolutionErrors.length > 0) {
    throw new Error(
      `${state.id}: fixture did not resolve: ${JSON.stringify(resolution.diagnostics)}`,
    );
  }

  const doctor = doctorBundle({
    bundle: validation.value,
    context: resolution.value,
    today,
  });
  const agents = compileContext(resolution.value, "agents-md");
  const prompt = compileContext(resolution.value, "prompt");
  if (!agents.value || !prompt.value) {
    throw new Error(`${state.id}: advisory projections did not compile`);
  }

  const effectiveEntries = resolution.value.entries.flatMap((entry) => {
    if ("withheld" in entry) return [];
    const { revision } = entry;
    return [
      Object.freeze({
        id: revision.id,
        domain: revision.domain,
        rev: revision.rev,
        body: revision.body,
        ...(revision.action === undefined ? {} : { action: revision.action }),
        ...(revision.effect === undefined ? {} : { effect: revision.effect }),
        ...(revision.route === undefined ? {} : { route: revision.route }),
        contested: entry.contested,
        staleReasons: entry.staleReasons,
      }),
    ];
  });

  return Object.freeze({
    label: state.label,
    summary: state.summary,
    input: files,
    validation: Object.freeze({
      ok: true,
      diagnostics: validation.diagnostics,
    }),
    doctor: Object.freeze({
      exitCode: doctorExitCode(doctor),
      pendingRevisions: doctor.pendingRevisions,
      findings: doctor.findings,
      ratios: doctor.ratios,
    }),
    resolution: Object.freeze({
      contextId: resolution.value.contextId,
      bundles: resolution.value.bundles.map(
        ({ bundleId, contentId, path }) => ({ bundleId, contentId, path }),
      ),
      effectiveEntries,
      withheldCount: resolution.value.entries.filter(
        (entry) => "withheld" in entry,
      ).length,
      diagnostics: resolution.value.diagnostics,
      resolutionErrors: resolution.value.resolutionErrors,
    }),
    projections: Object.freeze({
      "agents-md": Object.freeze({
        profile: agents.value.profile,
        content: agents.value.content,
      }),
      prompt: Object.freeze({
        profile: prompt.value.profile,
        content: prompt.value.content,
      }),
    }),
  });
}

async function readFixtureFiles(root) {
  const names = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map(({ name }) => name)
    .sort();
  return Promise.all(
    names.map(async (name) => {
      const absolute = resolve(root, name);
      const content = normalize(await readFile(absolute, "utf8"));
      return Object.freeze({
        path: relative(root, absolute).replaceAll("\\", "/"),
        sha256: sha256(content),
        content,
      });
    }),
  );
}

async function digestImplementation() {
  const paths = (
    await Promise.all(
      implementationRoots.map((path) => walkFiles(resolve(repository, path))),
    )
  )
    .flat()
    .map((path) => relative(repository, path).replaceAll("\\", "/"))
    .sort();
  const inputs = [];
  for (const path of paths) {
    inputs.push(
      `${path}\0${sha256(await readFile(resolve(repository, path)))}`,
    );
  }
  return sha256(inputs.join("\n"));
}

async function walkFiles(path) {
  const metadata = await stat(path);
  if (metadata.isFile()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  const children = [];
  for (const entry of entries) {
    children.push(...(await walkFiles(resolve(path, entry.name))));
  }
  return children;
}

function assertScenarioMatrix(generatedStates) {
  for (const state of states) {
    const generated = generatedStates[state.id];
    const policy = generated.resolution.effectiveEntries.find(
      ({ id }) => id === "policy.delivery-window",
    );
    if (policy?.rev !== state.expectedRevision) {
      throw new Error(
        `${state.id}: expected effective policy revision ${state.expectedRevision}`,
      );
    }
    if (generated.doctor.pendingRevisions !== state.expectedPending) {
      throw new Error(
        `${state.id}: expected ${state.expectedPending} pending revisions`,
      );
    }
  }

  const current = generatedStates.current;
  const draft = generatedStates.draft;
  const ratified = generatedStates.ratified;
  const currentPolicy = effectivePolicy(current);
  const draftPolicy = effectivePolicy(draft);
  const ratifiedPolicy = effectivePolicy(ratified);
  if (
    currentPolicy.body !== draftPolicy.body ||
    currentPolicy.route !== draftPolicy.route
  ) {
    throw new Error("draft: unratified meaning became effective");
  }
  if (
    current.resolution.contextId === draft.resolution.contextId ||
    current.resolution.bundles[0].contentId ===
      draft.resolution.bundles[0].contentId
  ) {
    throw new Error("draft: stored revision was not reflected in provenance");
  }
  if (
    ratifiedPolicy.body === currentPolicy.body ||
    ratifiedPolicy.route === currentPolicy.route
  ) {
    throw new Error("ratified: new approved meaning did not become effective");
  }
  if (
    !draft.doctor.findings.some(
      ({ code }) => code === "doctor.pending-revision",
    )
  ) {
    throw new Error("draft: pending-revision finding is missing");
  }
}

function effectivePolicy(state) {
  const policy = state.resolution.effectiveEntries.find(
    ({ id }) => id === "policy.delivery-window",
  );
  if (!policy) throw new Error("Effective policy is missing");
  return policy;
}

function normalize(value) {
  return `${value.replaceAll("\r\n", "\n").replaceAll("\r", "\n").replace(/\n*$/u, "")}\n`;
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
