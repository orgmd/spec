#!/usr/bin/env node
import { runCli } from "./main.js";

const code = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
});
process.exitCode = code;
