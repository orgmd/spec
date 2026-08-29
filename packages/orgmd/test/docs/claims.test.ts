import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const repository = new URL("../../../..", import.meta.url).pathname;
const read = (file: string) => readFileSync(resolve(repository, file), "utf8");

it("documents every shipped command and never claims advisory output is enforced", () => {
  const cli = read("docs/cli.md");
  for (const command of ["validate", "compile", "doctor", "init", "adopt"]) {
    expect(cli).toContain(`orgmd ${command}`);
  }
  for (const file of ["README.md", "docs/cli.md", "site/index.html"]) {
    expect(read(file)).not.toMatch(/orgmd (enforces|blocks|guarantees)/i);
  }
});

it("does not advertise v0.6 commands", () => {
  expect(read("docs/cli.md")).not.toContain("serve --mcp");
});

it("keeps revision statuses separate from lifecycle state", () => {
  const readme = read("README.md");
  const site = read("site/index.html");

  expect(readme).toMatch(
    /Revision status is exactly `draft`,\s+`approved`,\s+or `rejected`\./,
  );
  expect(site).toContain('class="chip s-rejected">rejected');
  expect(site).toContain(
    "Contestation and retirement are lifecycle states recorded only in",
  );
  expect(site).not.toContain('class="chip s-contested">contested');
  expect(site).not.toContain('class="chip s-superseded">superseded');
});

it("labels signing and non-advisory projections as future v0.5 work", () => {
  const site = read("site/index.html");

  expect(site).toContain(
    "Signing and <code>org.lock</code> are future hardening",
  );
  expect(site).toContain("Gate and handbook projections are future work.");
  expect(site).not.toContain("The bundle's release seal is re-signed");
  expect(site).not.toContain("the gate, the handbook. Nobody chases surfaces");
});

it("keeps remaining signing and projection examples outside v0.5", () => {
  const site = read("site/index.html");

  expect(site).not.toContain("# release seal · tamper-evident");
  expect(site).not.toContain("merged · sealed into org.lock");
  expect(site).toContain('data-v0-5="future-projections"');
  expect(site).toContain("Future projection examples — not shipped in v0.5.");
});

it("publishes the current release boundary without stale Pages claims", () => {
  const readme = read("README.md");
  const site = read("site/index.html");

  for (const document of [readme, site]) {
    expect(document).toContain("0.3.1-draft");
    expect(document).toContain("0.5.0");
    expect(document).toContain("Pages");
    expect(document).not.toContain("Pages publication still pending");
    expect(document).not.toContain("Pages deployment have not been published");
  }
  expect(site).toContain("The current CLI emits advisory text only.");
  expect(site).toContain('href="playground/"');
  expect(site).toContain('href="desk.html"');
});

it("keeps the Desk page visibly bounded as a local concept", () => {
  const desk = read("site/desk.html");

  expect(desk).toContain("Concept prototype · fictional data · no backend");
  expect(desk).toContain("local browser state only");
  expect(desk).toContain(
    "Nothing is saved, approved, synced, published, or enforced.",
  );
  for (const staleClaim of [
    "self-hosted on your infrastructure",
    "last sync:",
    "Enforced automatically",
    "Approved · enforced",
    "live across every assistant",
  ]) {
    expect(desk).not.toContain(staleClaim);
  }
});

it("explains composition and large-organisation scale without overstating v0.5", () => {
  const readme = read("README.md");
  const site = read("site/index.html");

  expect(site).toContain('data-v0-5="large-org-boundary"');
  expect(site).toContain(
    "It is not the name of one enormous company document.",
  );
  expect(site).toContain(
    "Entries make up bundles. Bundles on the chosen path make up effective context.",
  );
  expect(site).toContain("Sibling branches are not merged into that view.");
  expect(site).toContain("A bounded POC, not proven enterprise scale");
  expect(site).toContain("projection filtering is not access control");
  expect(readme).toContain(
    "ORG.md is the name of the standard, not one enormous document.",
  );
  for (const document of [readme, site]) {
    expect(document).not.toMatch(/enterprise[- ]ready|proven at scale/i);
  }
});

it("puts the playground decision before its technical evidence", () => {
  const playground = read("site/playground/index.html");

  expect(playground).toContain("The decision before the technical detail");
  expect(playground).toContain("Meaning currently in force");
  expect(playground).toContain(
    "A newer draft does not replace approved meaning.",
  );
  expect(playground).toContain("Evidence: recorded bundle source");
});

it("shows the Desk POC workflow without presenting it as implemented", () => {
  const desk = read("site/desk.html");

  expect(desk).toContain(
    "Possible POC workflow — not implemented by this page",
  );
  expect(desk).toContain("The interface is the approachable layer");
  expect(desk).toContain("one path, not one undifferentiated company register");
});
