# Error Handling and Retries

Best practices for handling API errors and implementing retry logic.

## Error Types

```python
import openai
from openai import APIError, APIConnectionError, RateLimitError

try:
    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[{"role": "user", "content": "Hello"}]
    )
except RateLimitError:
    print("Rate limited - back off and retry")
except APIConnectionError:
    print("Connection error - network issue")
except APIError as e:
    print(f"API error: {e.status_code} - {e.message}")
```

## Exponential Backoff

Implement intelligent retry with exponential backoff:

```python
import time
import random

def call_with_retry(func, max_retries=3):
    for attempt in range(max_retries):
        try:
            return func()
        except RateLimitError:
            if attempt == max_retries - 1:
                raise
            
            wait_time = (2 ** attempt) + random.uniform(0, 1)
            print(f"Retrying in {wait_time:.1f}s...")
            time.sleep(wait_time)
```

## Timeout Configuration

```python
import openai

openai.request_timeout = 30  # seconds

response = openai.ChatCompletion.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Tell me a story"}],
    request_timeout=60  # override per request
)
```

## Monitoring and Logging

```python
import logging

logging.basicConfig(level=logging.DEBUG)

# This will now show all API calls
response = openai.ChatCompletion.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello"}]
)
```
