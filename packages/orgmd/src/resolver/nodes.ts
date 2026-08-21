import type { ValidatedBundle } from "../model/types.js";

export function logicalNodePath(bundle: ValidatedBundle): string {
  return bundle.nodePath ?? bundle.path;
}

export function isAtOrBelow(node: string, ancestor: string): boolean {
  return node === ancestor || node.startsWith(`${ancestor}/`);
}
