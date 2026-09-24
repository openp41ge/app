# Thinking configuration

Key/value pairs describing this model's thinking configuration. Each **key**
becomes a thinking level in the composer's dropdown; each **value** is sent to
the provider **verbatim** as the request's `reasoning_effort`. You define the
levels the provider understands — there is no hardcoded mapping here.

Set a value to **`null`** (or an empty string, `off`, `none`, `0`) to disable
thinking for that level: `reasoning_effort` is omitted and the model applies
its default behaviour. Any other value — `low`, `medium`, `high`, or a
provider-specific level — is passed through unchanged.

```json
{
  "Off": null,
  "Minimal": "minimal",
  "Low": "low",
  "High": "high",
  "Max": "max"
}
```

> `null` is the JSON-native way to represent "off" — JSON has no `undefined`.
> The value must be accepted by your provider; if the server rejects a level
> you configured, pick one the provider supports (e.g. `low`/`medium`/`high`).
