# Chat Completions Example

How to make a simple chatbot using the Chat Completions API.

## Setup

```python
import openai

openai.api_key = "your-api-key"
```

## Basic Example

```python
response = openai.ChatCompletion.create(
  model="gpt-4",
  messages=[
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ]
)

print(response.choices[0].message["content"])
```

## Streaming

For real-time responses, use streaming:

```python
response = openai.ChatCompletion.create(
  model="gpt-4",
  messages=[{"role": "user", "content": "Tell a story"}],
  stream=True
)

for chunk in response:
    print(chunk.choices[0].delta.get("content", ""), end="", flush=True)
```

## Parameters

- `model`: Which model to use (gpt-4, gpt-3.5-turbo, etc.)
- `temperature`: Controls randomness (0-2, higher = more creative)
- `max_tokens`: Maximum length of response
- `top_p`: Nucleus sampling parameter

## Token Counting

Estimate tokens before making requests:

```python
def estimate_tokens(text, model="gpt-3.5-turbo"):
    import tiktoken
    enc = tiktoken.encoding_for_model(model)
    return len(enc.encode(text))
```
