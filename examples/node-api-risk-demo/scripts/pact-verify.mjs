import { readFileSync } from "node:fs";

const session = readFileSync("src/auth/session.ts", "utf8");
const schema = readFileSync("src/db/schema.ts", "utf8");
const failures = [];

if (/function canExportUsers[\s\S]*return true;/.test(session)) {
  failures.push("canExportUsers grants export access to any authenticated user.");
}

if (/role:\s*"ADMIN"/.test(schema)) {
  failures.push("New users default to ADMIN instead of USER.");
}

if (/exportToken:\s*"pending"/.test(schema)) {
  failures.push("Schema adds a pending export token by default.");
}

if (failures.length > 0) {
  console.error("contract smoke failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(12);
}

console.log("contract smoke passed");
