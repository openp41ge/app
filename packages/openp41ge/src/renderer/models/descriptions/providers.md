# Providers

The table of provider connections, keyed by provider id. The **active** one is
`providerId` — chats that don't pin a provider use that connection.

```json
{
  "vllm": {
    "baseUrl": "http://localhost:8000/v1",
    "defaultModel": "Qwen2.5-Coder-7B-Instruct",
    "models": [{ "id": "Qwen2.5-Coder-7B-Instruct" }]
  }
}
```
