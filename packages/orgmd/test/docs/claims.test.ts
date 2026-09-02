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
  const governance = read("GOVERNANCE.md");

  expect(readme).toMatch(
    /Revision status is exactly `draft`,\s+`approved`,\s+or `rejected`\./,
  );
  expect(governance).not.toMatch(/status:\s*(?:contested|superseded)\b/);
  expect(governance).toContain("`state: contested`");
  expect(governance).toMatch(/under\s+`org\.identity\.lifecycle`/);
  expect(governance).toMatch(
    /id: dec\.0003[\s\S]*?status: approved[\s\S]*?rev: 2[\s\S]*?revisit: 2027-08-01[\s\S]*?retirement is recorded separately under\s+`org\.identity\.lifecycle`\./,
  );
});

it("keeps the concise public boundary inside current v0.5 capability", () => {
  const site = read("site/index.html");

  expect(site).toContain(
    "The v0.5.0 proof reads one local company-to-team path and produces advisory text for review.",
  );
  expect(site).toContain(
    "It does not verify who approved a change, combine sources from different repositories, control access, publish approved guidance, enforce actions or prove performance at enterprise scale.",
  );
  expect(site).not.toMatch(
    /signing|release seal|gate projection|handbook projection/i,
  );
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
  expect(site).toContain("reference CLI 0.5.0");
  expect(site).toContain("Draft open standard · advisory output");
  expect(site).toContain('href="playground/"');
  expect(site).toContain('href="desk.html"');
});

it("keeps the Desk page visibly bounded as a local concept", () => {
  const desk = read("site/desk.html");

  expect(desk).toContain("Design concept · fictional data");
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
    "ORG.md is the standard, not one enormous company document.",
  );
  expect(site).toContain(
    "The proof combines the recorded guidance on this one selected path. It does not choose different guidance for each task.",
  );
  expect(site).toContain(
    "Finance and other regions are not included in this example view. That does not control who can open the source files.",
  );
  expect(site).toContain(
    "The design intent is for large organisations to use many small, owned bundles.",
  );
  expect(readme).toMatch(
    /scope-filtered projections are not a raw-file access-control boundary/i,
  );
  for (const staleClaim of [
    "Each layer adds only what this assistant needs from its place in the organisation.",
    "Finance and other regions stay out of this view.",
    "Large organisations use many small, owned bundles.",
  ]) {
    expect(site).not.toContain(staleClaim);
  }
  expect(readme).toContain(
    "ORG.md is the name of the standard, not one enormous document.",
  );
  for (const document of [readme, site]) {
    expect(document).not.toMatch(/enterprise[- ]ready|proven at scale/i);
  }
});

it("makes the playground result primary and technical evidence optional", () => {
  const playground = read("site/playground/index.html");

  expect(playground).toContain("A draft does not replace an approved rule.");
  expect(playground).toContain("Guidance in use now");
  expect(playground).toContain(
    "The draft waits. The approved rule stays in use.",
  );
  expect(playground).toContain("Show technical evidence");
  expect(playground).toContain('<details class="technical">');
});

it("shows a concise Desk workflow without presenting it as implemented", () => {
  const desk = read("site/desk.html");

  expect(desk).toContain("Three everyday steps.");
  expect(desk).toContain("Owner proposes");
  expect(desk).toContain("Person reviews");
  expect(desk).toContain("Guidance is available");
  expect(desk).toContain("Concept only.");
  expect(desk).not.toContain('role="tab"');
});

it("keeps each public route focused and concise", () => {
  const site = read("site/index.html");
  const playground = read("site/playground/index.html");
  const desk = read("site/desk.html");

  expect((site.match(/<section\b/g) ?? []).length).toBeLessThanOrEqual(2);
  expect((playground.match(/<section\b/g) ?? []).length).toBeLessThanOrEqual(3);
  expect((desk.match(/<section\b/g) ?? []).length).toBeLessThanOrEqual(4);
  expect(site).toContain('src="assets/orgmd-path.webp"');
  expect(site).not.toContain("Your industry, your tools");
  expect(site).not.toContain("What works today</h2>");
});
