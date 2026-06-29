import type { SecurityMatcher } from "./types";
import {
  containsAny,
  createCandidate,
  findParameterTaintedSinkLines,
  hasRouteEntryPoint,
  hasTemplateUserInputExpression,
  hasUserInputMarker,
  lineMatches,
  maskStringLiterals
} from "./utils";

const AUTH_MARKERS = ["auth", "session", "jwt", "token", "currentuser", "current_user", "requireuser", "requireauth", "isallowed"];

export const sqlInjectionMatcher: SecurityMatcher = {
  ruleId: "security-sql-injection",
  cwe: "CWE-89",
  title: "SQL injection candidate",
  description: "A database query appears to include unsafe raw SQL or request-controlled input.",
  severity: "high",
  confidence: "direct",
  languages: ["javascript", "typescript"],
  filePatterns: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
  examples: [
    {
      filePath: "src/api/users.ts",
      content: "await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = ${req.query.id}`);"
    }
  ],
  match(context) {
    const directMatches = lineMatches(context.content, (line) => {
      const codeLine = maskStringLiterals(line).toLowerCase();
      return (
        codeLine.includes("$queryrawunsafe") ||
        codeLine.includes("$executerawunsafe") ||
        ((codeLine.includes(".query(") || codeLine.includes("execute(")) &&
          (hasUserInputMarker(codeLine) || hasTemplateUserInputExpression(line)))
      );
    });
    const taintedMatches = findParameterTaintedSinkLines(context.content, [".query(", "execute(", "$queryrawunsafe", "$executerawunsafe"]);

    return uniqueMatches([...directMatches, ...taintedMatches]).map((match) =>
      createCandidate({
        ...this,
        file: context.filePath,
        line: match.line,
        snippet: match.text,
        evidence: "Raw SQL or dynamic query construction is present near request-controlled input."
      })
    );
  }
};

export const hardcodedSecretMatcher: SecurityMatcher = {
  ruleId: "security-hardcoded-secret",
  cwe: "CWE-798",
  title: "Hardcoded secret candidate",
  description: "A credential-like name appears to be assigned a literal secret value.",
  severity: "high",
  confidence: "direct",
  languages: ["javascript", "typescript"],
  filePatterns: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
  examples: [
    {
      filePath: "src/config.ts",
      content: "const STRIPE_SECRET_KEY = \"sk_live_1234567890abcdef\";"
    }
  ],
  match(context) {
    return lineMatches(context.content, (line, lowerLine) => {
      const codeLine = maskStringLiterals(line).toLowerCase();
      if (!containsAny(codeLine, ["secret", "api_key", "apikey", "access_token", "accesstoken", "private_key", "privatekey", "password"])) {
        return false;
      }

      if (!hasCredentialAssignment(codeLine)) {
        return false;
      }

      const quoted = line.match(/["']([^"']{12,})["']/);
      if (!quoted) {
        return false;
      }

      const literal = (quoted[1] ?? "").toLowerCase();
      return !containsAny(literal, ["example", "placeholder", "changeme", "test-secret", "dummy"]);
    }).map((match) =>
      createCandidate({
        ...this,
        file: context.filePath,
        line: match.line,
        snippet: match.text,
        evidence: "Credential-like identifier is assigned a long literal value."
      })
    );
  }
};

export const commandInjectionMatcher: SecurityMatcher = {
  ruleId: "security-command-injection",
  cwe: "CWE-78",
  title: "Command injection candidate",
  description: "A shell command appears to be built near request-controlled or process-controlled input.",
  severity: "high",
  confidence: "direct",
  languages: ["javascript", "typescript"],
  filePatterns: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
  examples: [
    {
      filePath: "src/api/archive.ts",
      content: "exec(`tar -czf ${req.query.name}.tgz uploads/${req.query.name}`);"
    }
  ],
  match(context) {
    const directMatches = lineMatches(context.content, (line, lowerLine) => {
      const codeLine = maskStringLiterals(line).toLowerCase();
      const usesUserInput = hasUserInputMarker(codeLine) || lowerLine.includes("${");
      return containsAny(codeLine, ["exec(", "execsync(", "spawn("]) && usesUserInput;
    });
    const taintedMatches = findParameterTaintedSinkLines(context.content, ["exec(", "execsync(", "spawn("]);

    return uniqueMatches([...directMatches, ...taintedMatches]).map((match) =>
      createCandidate({
        ...this,
        file: context.filePath,
        line: match.line,
        snippet: match.text,
        evidence: "Shell execution is combined with request-controlled input."
      })
    );
  }
};

export const pathTraversalMatcher: SecurityMatcher = {
  ruleId: "security-path-traversal",
  cwe: "CWE-22",
  title: "Path traversal candidate",
  description: "File-system access appears to use request-controlled path input.",
  severity: "high",
  confidence: "direct",
  languages: ["javascript", "typescript"],
  filePatterns: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
  examples: [
    {
      filePath: "src/api/files.ts",
      content: "return readFileSync(path.join(uploadRoot, req.query.file), \"utf8\");"
    }
  ],
  match(context) {
    const directMatches = lineMatches(context.content, (line) => {
      const codeLine = maskStringLiterals(line).toLowerCase();
      const fileAccess = containsAny(codeLine, ["readfile", "writefile", "createreadstream", "createwritestream"]);
      return fileAccess && hasUserInputMarker(codeLine);
    });
    const taintedMatches = findParameterTaintedSinkLines(context.content, [
      "readfile",
      "writefile",
      "createreadstream",
      "createwritestream"
    ]);

    return uniqueMatches([...directMatches, ...taintedMatches]).map((match) =>
      createCandidate({
        ...this,
        file: context.filePath,
        line: match.line,
        snippet: match.text,
        evidence: "File access is built from request-controlled input."
      })
    );
  }
};

export const ssrfMatcher: SecurityMatcher = {
  ruleId: "security-ssrf",
  cwe: "CWE-918",
  title: "SSRF candidate",
  description: "An outbound request appears to use request-controlled URL input.",
  severity: "high",
  confidence: "direct",
  languages: ["javascript", "typescript"],
  filePatterns: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
  examples: [
    {
      filePath: "src/api/proxy.ts",
      content: "const response = await fetch(req.query.url);"
    }
  ],
  match(context) {
    const directMatches = lineMatches(context.content, (line) => {
      const codeLine = maskStringLiterals(line).toLowerCase();
      const outbound = containsAny(codeLine, ["fetch(", "axios.get(", "axios.post(", "got(", "request("]);
      return outbound && hasUserInputMarker(codeLine);
    });
    const taintedMatches = findParameterTaintedSinkLines(context.content, ["fetch(", "axios.get(", "axios.post(", "got(", "request("]);

    return uniqueMatches([...directMatches, ...taintedMatches]).map((match) =>
      createCandidate({
        ...this,
        file: context.filePath,
        line: match.line,
        snippet: match.text,
        evidence: "Outbound HTTP request uses request-controlled input."
      })
    );
  }
};

export const unsafeHtmlMatcher: SecurityMatcher = {
  ruleId: "security-unsafe-html",
  cwe: "CWE-79",
  title: "Unsafe HTML rendering candidate",
  description: "HTML is rendered through an unsafe sink that can become XSS if input is attacker-controlled.",
  severity: "high",
  confidence: "direct",
  languages: ["javascript", "typescript"],
  filePatterns: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
  examples: [
    {
      filePath: "src/app/comment.tsx",
      content: "return <div dangerouslySetInnerHTML={{ __html: comment.body }} />;"
    }
  ],
  match(context) {
    return lineMatches(context.content, (line) => {
      const codeLine = maskStringLiterals(line).toLowerCase();
      return containsAny(codeLine, ["dangerouslysetinnerhtml", ".innerhtml", "v-html"]);
    }).map((match) =>
      createCandidate({
        ...this,
        file: context.filePath,
        line: match.line,
        snippet: match.text,
        evidence: "Unsafe HTML sink is present."
      })
    );
  }
};

export const missingAuthEntryPointMatcher: SecurityMatcher = {
  ruleId: "security-missing-auth-entrypoint",
  cwe: "CWE-306",
  title: "Missing auth entry-point candidate",
  description: "A public route or controller entry point changed without an obvious auth/session guard in the file.",
  severity: "high",
  confidence: "entry-point",
  languages: ["javascript", "typescript"],
  filePatterns: ["**/{api,routes,controllers}/**/*.{js,jsx,mjs,cjs,ts,tsx}", "**/route.{js,ts}"],
  examples: [
    {
      filePath: "app/api/admin/route.ts",
      content: "export async function POST(request: Request) { return Response.json({ ok: true }); }"
    }
  ],
  match(context) {
    const lowerContent = context.content.toLowerCase();
    if (!hasRouteEntryPoint(context.filePath, context.content) || containsAny(lowerContent, AUTH_MARKERS)) {
      return [];
    }

    return [
      createCandidate({
        ...this,
        file: context.filePath,
        line: 1,
        snippet: context.content.split(/\n/)[0]?.trim(),
        evidence: "Route/controller entry point has no obvious auth, session, token, or permission guard in the same file."
      })
    ];
  }
};

export const insecureCookieMatcher: SecurityMatcher = {
  ruleId: "security-insecure-cookie",
  cwe: "CWE-614",
  title: "Insecure cookie configuration candidate",
  description: "Cookie-setting code appears to omit common session cookie protections.",
  severity: "medium",
  confidence: "direct",
  languages: ["javascript", "typescript"],
  filePatterns: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
  examples: [
    {
      filePath: "src/auth/session.ts",
      content: "res.setHeader(\"Set-Cookie\", `session=${sessionId}; Path=/`);"
    }
  ],
  match(context) {
    const lowerContent = context.content.toLowerCase();
    const lines = context.content.split(/\n/);
    const hasCookieWrite = lines.some((line) => {
      const codeLine = maskStringLiterals(line).toLowerCase();
      return codeLine.includes(".cookie(") || (codeLine.includes("setheader(") && line.toLowerCase().includes("set-cookie"));
    });
    if (!hasCookieWrite) {
      return [];
    }

    const missingProtection = !lowerContent.includes("httponly") || !lowerContent.includes("secure") || !lowerContent.includes("samesite");
    if (!missingProtection) {
      return [];
    }

    const cookieLine = lineMatches(context.content, (line) => {
      const codeLine = maskStringLiterals(line).toLowerCase();
      return codeLine.includes(".cookie(") || (codeLine.includes("setheader(") && line.toLowerCase().includes("set-cookie"));
    })[0];
    return [
      createCandidate({
        ...this,
        file: context.filePath,
        line: cookieLine?.line,
        snippet: cookieLine?.text,
        evidence: "Cookie-setting code is missing one or more of HttpOnly, Secure, or SameSite protections."
      })
    ];
  }
};

export const jwtUnsafeVerificationMatcher: SecurityMatcher = {
  ruleId: "security-jwt-unsafe-verification",
  cwe: "CWE-347",
  title: "Unsafe JWT verification candidate",
  description: "JWT handling appears to trust decoded claims or disable important verification controls.",
  severity: "high",
  confidence: "direct",
  languages: ["javascript", "typescript"],
  filePatterns: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
  examples: [
    {
      filePath: "src/auth/session.ts",
      content: "const claims = jwt.decode(token); return { userId: claims.sub, role: claims.role };"
    },
    {
      filePath: "src/auth/session.ts",
      content: "jwt.verify(token, secret, { ignoreExpiration: true });"
    }
  ],
  match(context) {
    return lineMatches(context.content, (line) => {
      const codeLine = maskStringLiterals(line).toLowerCase();
      const lowerLine = line.toLowerCase();
      return (
        containsAny(codeLine, ["jwt.decode(", "decodejwt("]) ||
        (containsAny(codeLine, ["jwt.verify(", ".verify("]) &&
          (lowerLine.includes("ignoreexpiration") || lowerLine.includes("algorithms") && lowerLine.includes("none")))
      );
    }).map((match) =>
      createCandidate({
        ...this,
        file: context.filePath,
        line: match.line,
        snippet: match.text,
        evidence: "JWT code decodes claims without verification or weakens verification options."
      })
    );
  }
};

export const DEFAULT_SECURITY_MATCHERS: SecurityMatcher[] = [
  sqlInjectionMatcher,
  hardcodedSecretMatcher,
  commandInjectionMatcher,
  pathTraversalMatcher,
  ssrfMatcher,
  unsafeHtmlMatcher,
  missingAuthEntryPointMatcher,
  insecureCookieMatcher,
  jwtUnsafeVerificationMatcher
];

function hasCredentialAssignment(codeLine: string): boolean {
  const compact = codeLine.replaceAll(" ", "").replaceAll("\t", "").toLowerCase();
  const markers = ["secret", "api_key", "apikey", "access_token", "accesstoken", "private_key", "privatekey", "password"];

  return markers.some((marker) => {
    const markerIndex = compact.indexOf(marker);
    if (markerIndex < 0) {
      return false;
    }

    const assignmentWindow = compact.slice(markerIndex + marker.length, markerIndex + marker.length + 80);
    return assignmentWindow.includes("=") || assignmentWindow.includes(":");
  });
}

function uniqueMatches(matches: Array<{ line: number; text: string }>): Array<{ line: number; text: string }> {
  const byKey = new Map<string, { line: number; text: string }>();
  for (const match of matches) {
    byKey.set(`${match.line}:${match.text}`, match);
  }
  return [...byKey.values()];
}
