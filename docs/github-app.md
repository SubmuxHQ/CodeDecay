# CodeDecay GitHub App

The CodeDecay GitHub App is an optional hosted surface for teams that want
CodeDecay to run automatically on pull requests.

The app does not replace the CLI or GitHub Action. The open-source CLI remains
local-first and useful without the hosted app.

## What the app does

For pull request events, the app:

1. receives a GitHub webhook,
2. creates an in-progress CodeDecay check run,
3. checks out the pull request into a temporary directory,
4. runs deterministic CodeDecay analysis,
5. posts or updates one PR comment,
6. completes the check run.

For the first hosted version, the app only runs deterministic PR analysis. It
does not run project commands, deployment commands, LLM calls, model calls, or
CodeDecayCloud services.

## Create the GitHub App

Create a GitHub App in the GitHub organization that will own the hosted app.

Create the App from [`github-app-manifest.json`](./github-app-manifest.json) in
the GitHub App creation flow. Its webhook URL is the Cloud Run service URL:

```text
https://codedecay-github-app-1093061541451.us-central1.run.app/github/webhooks
```

Subscribe to these events:

- Pull request

Use these repository permissions:

- Metadata: read-only
- Contents: read-only
- Pull requests: read-only
- Issues: read and write
- Checks: read and write

The Issues permission is required because GitHub PR comments use the Issues API.

## Google Cloud Run deployment

The service is designed for Cloud Run in project
`project-7279e7f9-46cf-49d4-bbd`, region `us-central1`. Store each required
value in Secret Manager, never in a repository, command history, or GitHub
Actions secret.

Create the secret containers, then add values from local files. Keep the
private key and webhook secret out of shell history and source control:

```bash
gcloud secrets create codedecay-github-app-id
gcloud secrets create codedecay-github-app-private-key
gcloud secrets create codedecay-github-app-webhook-secret
gcloud secrets versions add codedecay-github-app-id --data-file=app-id.txt
gcloud secrets versions add codedecay-github-app-private-key --data-file=private-key.pem
gcloud secrets versions add codedecay-github-app-webhook-secret --data-file=webhook-secret.txt
```

Deploy the reviewed commit with Cloud Run. Keep a single instance during the
staging rollout so duplicate webhook handling cannot race across instances.

```bash
gcloud run deploy codedecay-github-app \
  --project=project-7279e7f9-46cf-49d4-bbd \
  --region=us-central1 \
  --source=. \
  --allow-unauthenticated \
  --min-instances=1 \
  --max-instances=1 \
  --memory=1Gi \
  --cpu=1 \
  --set-env-vars=NODE_ENV=production,GITHUB_WEBHOOK_PATH=/github/webhooks \
  --set-secrets=GITHUB_APP_ID=codedecay-github-app-id:latest,GITHUB_PRIVATE_KEY=codedecay-github-app-private-key:latest,GITHUB_WEBHOOK_SECRET=codedecay-github-app-webhook-secret:latest
```

Cloud Run receives these required environment variables from Secret Manager:

```text
GITHUB_APP_ID=<numeric app id>
GITHUB_PRIVATE_KEY=<GitHub App private key PEM>
GITHUB_WEBHOOK_SECRET=<webhook secret configured in GitHub>
NODE_ENV=production
```

Optional environment variables:

```text
PORT=3000
GITHUB_WEBHOOK_PATH=/github/webhooks
```

If the private key is stored with escaped newlines, the service converts `\n`
back to PEM newlines at startup.

## First staging test

Before installing the app broadly:

1. install the GitHub App on a test repository,
2. open a harmless documentation-only PR,
3. confirm the CodeDecay check run appears,
4. confirm one PR comment is created,
5. push another commit to the PR,
6. confirm the existing CodeDecay comment is updated instead of duplicated.

Do not enable branch protection around the app until the staging PR behavior is
verified.

## Safety boundary

The hosted app intentionally has a narrow v0 boundary:

- no telemetry,
- no LLM or model calls,
- no arbitrary command execution,
- no project test/start/deploy command execution,
- no persisted repository checkout,
- temporary checkout directories are removed after analysis.

Future hosted execution or red-team behavior should require a separate design
and sandboxing review.
