import { weakTestRuleIds as testAuditWeakTestRuleIds } from "@submuxhq/codedecay-test-audit";

export const WEAK_TEST_RULES = new Set(testAuditWeakTestRuleIds());

export const EDGE_CASE_TASK_RULES: Array<{ title: string; keywords: string[] }> = [
  {
    title: "Add auth negative-path proof",
    keywords: ["auth", "credential", "privilege", "denied"]
  },
  {
    title: "Exercise the real API boundary",
    keywords: ["api", "route", "payload"]
  },
  {
    title: "Verify database and schema behavior",
    keywords: ["schema", "database", "migration", "record"]
  },
  {
    title: "Verify runtime configuration behavior",
    keywords: ["config", "environment", "build", "start"]
  },
  {
    title: "Strengthen test proof",
    keywords: ["test", "coverage", "assertion", "mock"]
  }
];
