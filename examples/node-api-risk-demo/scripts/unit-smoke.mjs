import { existsSync, readFileSync } from "node:fs";

const routePath = "src/routes/users.ts";

if (!existsSync(routePath)) {
  console.error(`Missing ${routePath}`);
  process.exit(1);
}

const route = readFileSync(routePath, "utf8");

if (!route.includes('router.get("/users"')) {
  console.error("Users API route is not registered.");
  process.exit(1);
}

console.log("unit smoke passed");
