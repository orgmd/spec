export const LOGICAL_NODE_PATH_PATTERN =
  /^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/;

export function isLogicalNodePath(value: string): boolean {
  return LOGICAL_NODE_PATH_PATTERN.test(value);
}
