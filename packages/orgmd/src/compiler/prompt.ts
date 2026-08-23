import { renderBundleLine, renderDomainSections } from "./agents-md.js";
import type { ResolvedContext } from "../resolver/types.js";

export function renderPrompt(context: ResolvedContext): string {
  const header = [
    "[ORG.md advisory context]",
    "profile: orgmd-prompt-v1",
    `context: ${context.contextId}`,
    `bundles: ${renderBundleLine(context)}`,
  ].join("\n");
  return `${header}\n\n${renderDomainSections(context)}\n[end ORG.md advisory context]`;
}
