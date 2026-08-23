import type { Diagnostic } from "../diagnostics/types.js";

export interface CliIo {
  readonly cwd: string;
  readonly stdin: NodeJS.ReadableStream;
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
  readonly env: Readonly<NodeJS.ProcessEnv>;
}

export type CliExitCode = 0 | 1 | 2;

export interface CliFailure {
  readonly code: string;
  readonly message: string;
  readonly diagnostics?: readonly Diagnostic[];
}
