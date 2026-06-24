export async function getInstallationToken(octokit: {
  auth?: ((options: { type: "installation" }) => Promise<unknown>) | undefined;
}): Promise<string> {
  if (!octokit.auth) {
    throw new Error("GitHub App authentication is unavailable for this webhook context.");
  }

  const auth = await octokit.auth({ type: "installation" });
  if (isTokenAuth(auth)) {
    return auth.token;
  }

  throw new Error("GitHub App installation token was not returned by Octokit auth.");
}

function isTokenAuth(value: unknown): value is { token: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    "token" in value &&
    typeof (value as { token?: unknown }).token === "string"
  );
}
