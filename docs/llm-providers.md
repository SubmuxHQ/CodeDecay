# LLM Providers

CodeDecay is deterministic by default. The default configuration does not call
an LLM, does not require API keys, and does not use a hosted CodeDecay model.

Future or opt-in red-team commands can use user-owned providers for edge-case
reasoning. Model output must be treated as untrusted suggestions, not commands
to execute.

## Current OSS State

Today, `codedecay ai`, `codedecay analyze`, `codedecay redteam`,
`codedecay agent`, and `codedecay snapshot` stay deterministic. `codedecay
llm-review` is the explicit opt-in path for user-owned provider suggestions.

That means this page is about preparing user-owned providers cleanly and
explicitly, not about hidden default behavior.

## Recommended Quickstart

The shortest local-first path is Ollama:

1. Keep deterministic analysis as your default.
2. Configure Ollama explicitly in `.codedecay/config.yml`.
3. Run `codedecay llm-review --ping` to validate the provider.
4. Run `codedecay llm-review --base main --head HEAD --format markdown` when
   you want optional model suggestions on top of deterministic analysis.

```yaml
llm:
  provider: ollama
  model: qwen2.5-coder
  endpoint: http://127.0.0.1:11434
  timeoutMs: 30000
```

```bash
npx codedecay llm-review --ping
npx codedecay llm-review --base main --head HEAD --format markdown
```

If the provider config is incomplete, CodeDecay fails clearly instead of
silently falling back to a hosted default.

## Disabled By Default

```yaml
llm:
  provider: disabled
  timeoutMs: 30000
```

This is the default when no config file exists.

## Local Ollama

Ollama support is designed for local models running on the user's machine.

```yaml
llm:
  provider: ollama
  model: qwen2.5-coder
  endpoint: http://127.0.0.1:11434
  timeoutMs: 30000
```

CodeDecay only calls this provider from commands that explicitly opt into LLM
assistance. The current deterministic `codedecay analyze` command does not call
an LLM.

## LiteLLM / OpenAI-Compatible BYOK

CodeDecay can construct a LiteLLM/OpenAI-compatible provider for local or BYOK
setups. It does not default to a hosted endpoint; you must provide the endpoint
and model explicitly.

```yaml
llm:
  provider: litellm
  model: gpt-4.1-mini
  endpoint: http://127.0.0.1:4000/v1
  apiKeyEnv: LITELLM_API_KEY
  timeoutMs: 30000
```

`apiKeyEnv` is the name of an environment variable. Do not put literal API keys
in config files.

Common failure cases are explicit:

- missing `llm.model`
- missing `llm.endpoint` for LiteLLM/OpenAI-compatible setups
- missing API key environment variables when `apiKeyEnv` is configured
- provider connectivity failures when `codedecay llm-review --ping` cannot reach
  the configured endpoint

The provider uses an OpenAI-compatible `/chat/completions` request. Responses
are parsed into untrusted suggestions when possible. CodeDecay must not execute
commands from model output.

## Future Providers

The provider interface leaves room for additional adapters later. Those adapters
should remain optional and must not change the default local-first behavior.
