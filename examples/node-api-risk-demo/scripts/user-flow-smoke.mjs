import { existsSync, readFileSync } from "node:fs";

const files = ["src/routes/users.ts", "src/auth/session.ts", "src/db/schema.ts"];

for (const file of files) {
  if (!existsSync(file)) {
    console.error(`Missing ${file}`);
    process.exit(1);
  }
}

const route = readFileSync("src/routes/users.ts", "utf8");

if (!route.includes("requireSession")) {
  console.error("Users route no longer checks session state.");
  process.exit(1);
}

console.log("user-flow smoke passed");
