export function looksLikeEnvironmentFailure(text: string): boolean {
  return /\b(econnrefused|enotfound|etimedout|network|dns|port|server was not ready|health|base url|preview url|start command|playwright is not installed|browser executable|cannot find module|timed out waiting for)\b/i.test(
    text
  );
}

export function looksLikeAuthOrTestDataFailure(text: string): boolean {
  return /\b(401|403|unauthorized|forbidden|auth|login|session|token|cookie|permission|rbac|fixture|seed|test data|test account|not found.*user|missing user)\b/i.test(
    text
  );
}

export function looksLikeGeneratedTestWeakness(text: string): boolean {
  return /\b(locator|strict mode violation|getbyrole|getbylabel|getbytext|selector|element is not visible|element not found|detached from dom|waiting for locator|to be visible|timeout.*locator|click intercepted)\b/i.test(
    text
  );
}

export function looksLikeApiRegression(text: string): boolean {
  return /\b(5\d\d|500|502|503|504|server error|documented status|undocumented status|expected .* got|response contract|schema|invalid json)\b/i.test(
    text
  );
}
