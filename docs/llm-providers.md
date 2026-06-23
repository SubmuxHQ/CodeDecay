# LLM Providers

CodeDecay is deterministic by default. The default configuration does not call
an LLM, does not require API keys, and does not use a hosted CodeDecay model.

Future red-team commands can optionally use user-owned providers for edge-case
reasoning. Model output must be treated as untrusted suggestions, not commands
to execute.

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

CodeDecay should only call this provider from commands that explicitly opt into
LLM assistance. The current deterministic `codedecay analyze` command does not
call an LLM.

## Future Providers

The provider interface leaves room for LiteLLM and BYOK adapters later. Those
adapters should remain optional and must not change the default local-first
behavior.
