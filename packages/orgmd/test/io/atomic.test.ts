import {
  lstat,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { atomicWriteFile } from "../../src/io/atomic.js";

const directories: string[] = [];

async function fixtureDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "orgmd-atomic-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("atomicWriteFile", () => {
  it("replaces a file only when overwrite is explicit", async () => {
    const directory = await fixtureDir();
    const path = join(directory, "output.txt");
    await writeFile(path, "original", "utf8");

    const refused = await atomicWriteFile(
      path,
      new TextEncoder().encode("replacement"),
      { overwrite: false },
    );
    expect(refused.value).toBeUndefined();
    expect(await readFile(path, "utf8")).toBe("original");

    const replaced = await atomicWriteFile(
      path,
      new TextEncoder().encode("replacement"),
      { overwrite: true },
    );
    expect(replaced.value).toBeUndefined();
    expect(replaced.diagnostics).toEqual([]);
    expect(await readFile(path, "utf8")).toBe("replacement");
  });

  it("refuses to follow a symlink target", async () => {
    const directory = await fixtureDir();
    const outside = join(directory, "outside.txt");
    const target = join(directory, "output.txt");
    await writeFile(outside, "original", "utf8");
    await symlink(outside, target);

    const result = await atomicWriteFile(
      target,
      new TextEncoder().encode("replacement"),
      { overwrite: true },
    );

    expect(result.value).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      "io.symlink-target",
    );
    expect(await readFile(outside, "utf8")).toBe("original");
    expect((await lstat(target)).isSymbolicLink()).toBe(true);
  });

  it("syncs the containing directory after its committed rename", async () => {
    const directory = await fixtureDir();
    const path = join(directory, "output.txt");
    await writeFile(path, "original", "utf8");
    const events: string[] = [];

    const result = await atomicWriteFile(
      path,
      new TextEncoder().encode("replacement"),
      {
        overwrite: true,
        io: {
          rename: async (from, to) => {
            events.push("rename");
            await rename(from, to);
          },
          syncParent: async (parent) => {
            events.push(
              `sync:${await readFile(join(parent, "output.txt"), "utf8")}`,
            );
          },
        },
      },
    );

    expect(result.diagnostics).toEqual([]);
    expect(events).toEqual(["rename", "sync:replacement"]);
  });
});
