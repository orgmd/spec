import { mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverCompilePath,
  type DiscoveryIo,
} from "../../src/cli/discovery.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function directory(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "orgmd-discovery-"));
  directories.push(value);
  return value;
}

function failingLstat(code: string): DiscoveryIo {
  return {
    realpath,
    stat,
    lstat: async () => {
      throw Object.assign(new Error("lstat failed"), { code });
    },
  };
}

describe("compile path discovery", () => {
  it("reports non-ENOENT lstat failures as operational errors", async () => {
    const result = await discoverCompilePath(
      await directory(),
      failingLstat("EACCES"),
    );

    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "cli.discovery-failed",
        severity: "error",
      }),
    ]);
  });

  it("treats ENOENT as ordinary org.md absence", async () => {
    const result = await discoverCompilePath(
      await directory(),
      failingLstat("ENOENT"),
    );

    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "cli.no-org-file" }),
    ]);
  });
});
