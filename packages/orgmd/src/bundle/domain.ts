import type { Domain } from "../model/types.js";

export function mapDomain(relativePath: string): Domain | undefined {
  if (relativePath === "org.md") return "identity";
  if (relativePath === "glossary.md") return "glossary";
  if (relativePath === "policies.md") return "policy";
  if (relativePath === "ownership.md") return "ownership";
  if (relativePath === "done.md") return "done";
  if (relativePath.startsWith("decisions/") && relativePath.endsWith(".md")) {
    return "decision";
  }
  return undefined;
}
