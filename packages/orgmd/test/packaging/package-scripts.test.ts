import { execFileSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("package asset preparation", () => {
  it("starts from a clean dist before copying public assets", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "orgmd-package-assets-"));
    temporaryRoots.push(root);

    await mkdir(resolve(root, "scripts"), { recursive: true });
    await copyFile(
      resolve(process.cwd(), "scripts/copy-package-assets.mjs"),
      resolve(root, "scripts/copy-package-assets.mjs"),
    );
    await mkdir(resolve(root, "packages/orgmd/dist"), { recursive: true });
    await writeFile(
      resolve(root, "packages/orgmd/dist/stale-ignored.js"),
      "stale\n",
    );
    await writeFile(resolve(root, "LICENSE-APACHE"), "license\n");
    await mkdir(resolve(root, "schema"), { recursive: true });
    await writeFile(
      resolve(root, "schema/entry.schema.json"),
      '{"title":"entry"}\n',
    );
    await mkdir(resolve(root, "conformance/core-v0.1"), {
      recursive: true,
    });
    await writeFile(
      resolve(root, "conformance/core-v0.1/manifest.json"),
      '{"version":"core-v0.1"}\n',
    );

    execFileSync(process.execPath, [
      resolve(root, "scripts/copy-package-assets.mjs"),
    ]);

    await expect(
      readFile(resolve(root, "packages/orgmd/dist/stale-ignored.js")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(
        resolve(root, "packages/orgmd/dist/schema/entry.schema.json"),
        "utf8",
      ),
    ).resolves.toContain("entry");
  });
});
