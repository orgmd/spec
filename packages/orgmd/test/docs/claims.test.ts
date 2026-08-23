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

  expect(readme).toContain(
    "Revision status is exactly `draft`, `approved`, or `rejected`.",
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
