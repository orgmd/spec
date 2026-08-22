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
