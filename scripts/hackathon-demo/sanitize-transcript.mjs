#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { readOptionValue } from "../lib/args.mjs";

const options = parseArgs(process.argv.slice(2));
const input = resolve(options.input);
const output = resolve(options.output);
const replacements = [
  [resolve(options.demoRepo), "<DEMO_REPO>"],
  [resolve(options.checkout), "<CODEDECAY_CHECKOUT>"],
];

let transcript = readFileSync(input, "utf8");
for (const [privatePath, label] of replacements) {
  transcript = transcript.replaceAll(privatePath, label);
}

const remainingHomePaths = transcript.match(/\/Users\/[^/\s"\\]+/g) ?? [];
if (remainingHomePaths.length > 0) {
  throw new Error(`Transcript still contains private home paths: ${remainingHomePaths.join(", ")}`);
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, transcript, "utf8");
process.stdout.write(`Sanitized transcript written to ${output}\n`);

function parseArgs(args) {
  const parsed = { input: "", output: "", checkout: "", demoRepo: "" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") parsed.input = readOptionValue(args, ++index, arg);
    else if (arg === "--output") parsed.output = readOptionValue(args, ++index, arg);
    else if (arg === "--checkout") parsed.checkout = readOptionValue(args, ++index, arg);
    else if (arg === "--demo-repo") parsed.demoRepo = readOptionValue(args, ++index, arg);
    else throw new Error(`Unknown option: ${arg}`);
  }
  for (const [name, value] of Object.entries(parsed)) {
    if (!value) throw new Error(`Missing required option --${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
  }
  return parsed;
}
