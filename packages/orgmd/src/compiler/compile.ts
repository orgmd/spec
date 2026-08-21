import type { Diagnostic } from "../diagnostics/types.js";
import type { ResolvedContext } from "../resolver/types.js";
import { renderAgentsMd } from "./agents-md.js";
import { renderPrompt } from "./prompt.js";
import type {
  CompileResult,
  CompileTarget,
  CompiledProjection,
} from "./types.js";

const RESOLUTION_ERROR: Diagnostic = Object.freeze({
  code: "compiler.resolution-error",
  severity: "error",
  message:
    "Compilation refused because the resolved context contains resolution errors.",
});

function stableContent(content: string): string {
  return `${content.replace(/\r\n?/gu, "\n").replace(/\n+$/gu, "")}\n`;
}

export function compileContext(
  context: ResolvedContext,
  target: CompileTarget,
): CompileResult {
  if (context.resolutionErrors.length > 0) {
    return { diagnostics: [RESOLUTION_ERROR] };
  }
  const projection: CompiledProjection =
    target === "agents-md"
      ? {
          target,
          profile: "orgmd-agents-md-v1",
          content: stableContent(renderAgentsMd(context)),
        }
      : {
          target,
          profile: "orgmd-prompt-v1",
          content: stableContent(renderPrompt(context)),
        };
  return { value: Object.freeze(projection), diagnostics: [] };
}
