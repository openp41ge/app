# Provider connection

A single provider connection. The key is the provider id (e.g. `vllm`,
`openai`). Each provider exposes an **OpenAI-compatible** endpoint; the runtime
appends `/chat/completions` and `/models`.

```json
{
  "baseUrl": "https://api.example.com/v1",
  "defaultModel": "gpt-4o",
  "apiKey": "sk-…",
  "temperature": 0.7,
  "models": [{ "id": "gpt-4o" }]
}
```
