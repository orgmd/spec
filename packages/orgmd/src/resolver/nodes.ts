import { isLogicalNodePath } from "../bundle/node-path.js";
import type { ValidatedBundle } from "../model/types.js";

export function logicalNodePath(bundle: ValidatedBundle): string {
  if (bundle.nodePath !== undefined) {
    return isLogicalNodePath(bundle.nodePath) ? bundle.nodePath : "";
  }
  return isLogicalNodePath(bundle.path) ? bundle.path : "";
}

export function isAtOrBelow(node: string, ancestor: string): boolean {
  return node === ancestor || node.startsWith(`${ancestor}/`);
}
