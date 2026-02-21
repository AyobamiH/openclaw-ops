# API Rate Limits and Retry Strategy

## Understanding Rate Limits

OpenAI API implements rate limits to ensure fair access and system stability. Rate limits vary by model and your account tier.

### Rate Limit Headers

The API returns rate limit information in HTTP headers:
- `x-ratelimit-limit-requests`: Maximum requests per minute
- `x-ratelimit-limit-tokens`: Maximum tokens per minute  
- `x-ratelimit-remaining-requests`: Requests remaining in current window
- `x-ratelimit-remaining-tokens`: Tokens remaining in current window

### Handling 429 Responses

When you hit a rate limit, the API returns HTTP 429 Too Many Requests with a `Retry-After` header indicating how many seconds to wait.

### Exponential Backoff

Implement exponential backoff for retries:
```javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429) {
        const waitMs = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, waitMs));
      } else {
        throw error;
      }
    }
  }
}
```

### Batch Processing

For large volumes, consider using the Batch API to reduce costs and avoid rate limits on individual requests.
