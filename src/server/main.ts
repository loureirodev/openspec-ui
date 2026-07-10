import { runCli } from "./cli.js";

const { exitCode } = await runCli(process.argv.slice(2));

// A bound server keeps the event loop alive; help, version and failures fall through.
if (exitCode !== 0) process.exitCode = exitCode;
