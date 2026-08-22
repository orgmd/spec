import { describe, expect, it } from "vitest";
import { parseCommand } from "../../src/cli/args.js";
import { HELP } from "../../src/cli/render.js";

describe("CLI argument parsing", () => {
  it.each([
    [[], "usage"],
    [["unknown"], "usage"],
    [["compile", "--target", "agents-md", "--all"], "usage"],
  ] as const)("rejects %j as %s", (argv, kind) => {
    expect(parseCommand(argv).kind).toBe(kind);
  });

  it("accepts compile's explicit target and clearance", () => {
    expect(
      parseCommand([
        "compile",
        "bundle",
        "--target",
        "prompt",
        "--clearance",
        "public,internal",
      ]),
    ).toMatchObject({
      kind: "command",
      command: "compile",
      path: "bundle",
      target: "prompt",
      clearance: ["public", "internal"],
    });
  });

  it("renders interactive init and its accepted JSON output flag in help", () => {
    expect(parseCommand(["init", "--json"])).toMatchObject({
      kind: "command",
      command: "init",
      nonInteractive: false,
      json: true,
    });
    expect(HELP).toContain("init [path] [--json]");
  });
});
