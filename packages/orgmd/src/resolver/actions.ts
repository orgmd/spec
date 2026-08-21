import type { EntryRevision } from "../model/types.js";

const ACTION_PATTERN = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*(?:\.\*)?$/;

export function isValidAction(action: string): boolean {
  return ACTION_PATTERN.test(action);
}

export function actionContains(parent: string, child: string): boolean {
  if (!isValidAction(parent) || !isValidAction(child)) return false;
  if (!parent.endsWith(".*")) return parent === child;

  const parentSegments = parent.slice(0, -2).split(".");
  const childLiteral = child.endsWith(".*") ? child.slice(0, -2) : child;
  const childSegments = childLiteral.split(".");
  if (childSegments.length < parentSegments.length) return false;
  if (!child.endsWith(".*") && childSegments.length === parentSegments.length) {
    return false;
  }
  return parentSegments.every(
    (segment, index) => childSegments[index] === segment,
  );
}

export function effectStrength(
  effect: NonNullable<EntryRevision["effect"]>,
): number {
  switch (effect) {
    case "allow":
      return 0;
    case "escalate":
      return 1;
    case "deny":
      return 2;
  }
}
