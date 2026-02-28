# OpenClaw Orchestrator: API Reference

**Base URL:** `http://localhost:3000`  
**Authentication:** None (Recommend JWT in production)  
**Rate Limiting:** Recommended 100 req/sec per endpoint  

---

## Health & Status Endpoints

### GET /health

System health check with all endpoint URLs.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-23T11:10:17.143Z",
  "metrics": "http://localhost:9100/metrics",
  "knowledge": "http://localhost:3000/api/knowledge/summary",
  "persistence": "http://localhost:3000/api/persistence/health"
}
```

**Status Codes:**
- `200 OK` - System healthy
- `503 Service Unavailable` - One or more services down

---

## Alert Webhook Endpoints

### POST /webhook/alerts

Receives alert notifications from AlertManager.

**Body:**
```json
{
  "status": "firing|resolved",
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "HighErrorRate",
        "severity": "critical",
        "service": "api"
      },
      "annotations": {
        "summary": "Error rate is high",
        "description": "Error rate: 5.2%"
      },
      "startsAt": "2026-02-23T10:00:00Z",
      "endsAt": "0001-01-01T00:00:00Z"
    }
  ]
}
```

**Response:**
```json
{
  "status": "ok"
}
```

**Headers:**
- `Content-Type: application/json`

**Status Codes:**
- `200 OK` - Alert processed
- `400 Bad Request` - Invalid alert format
- `500 Internal Server Error` - Processing error

---

## Knowledge Base Endpoints (Phase 5)

### POST /api/knowledge/query

Search the knowledge base for relevant patterns and solutions.

**Request:**
```json
{
  "query": "high error rate"
}
```

**Response:**
```json
{
  "success": true,
  "results": {
    "entries": [
      {
        "id": "KB-2026-02-23-001",
        "title": "High Error Rate Pattern",
        "category": "alert_pattern",
        "severity": "critical",
        "solution": "Check recent deployment and rollback if needed",
        "steps": [
          "View recent deployments",
          "Identify failed deployment",
          "Execute rollback",
          "Monitor error rate recovery"
        ],
        "frequency": 5,
        "tags": ["errors", "deployment", "rollback"]
      }
    ],
    "concepts": [
      {
        "id": "concept-error-rate",
        "name": "High Error Rate",
        "type": "metric",
        "frequency": 12,
        "relatedConcepts": ["deployment", "service"]
      }
    ],
    "solutions": [
      {
        "id": "solution-rollback",
        "title": "Rollback Deployment",
        "expectedOutcome": "Error rate returns to baseline"
      }
    ]
  },
  "sources": ["consolidation-2026-02-23", "historical-patterns"]
}
```

**Query Parameters:** None

**Status Codes:**
- `200 OK` - Query successful
- `400 Bad Request` - Missing query parameter
- `500 Internal Server Error` - Search error

---

### GET /api/knowledge/summary

Get knowledge base statistics and recent learnings.

**Response:**
```json
{
  "lastUpdated": "2026-02-23T07:27:15.979Z",
  "stats": {
    "total": 12,
    "byCategory": {
      "alert_pattern": 5,
      "metric_anomaly": 3,
      "optimization": 2,
      "troubleshooting": 2,
      "runbook": 0
    },
    "byTag": {
      "errors": 6,
      "performance": 4,
      "deployment": 3,
      "database": 2
    },
    "recentUpdates": [
      {
        "id": "KB-2026-02-23-012",
        "title": "Database Connection Pool Exhaustion",
        "updatedAt": "2026-02-23T07:00:00Z"
      }
    ],
    "criticalEntries": [
      {
        "id": "KB-2026-02-23-001",
        "title": "Critical: Memory Leak Detection",
        "severity": "critical",
        "frequency": 8
      }
    ]
  },
  "networkStats": {
    "totalConcepts": 34,
    "totalLinks": 78,
    "avgConnectivity": 2.3,
    "mostConnected": [
      {
        "name": "Deployment",
        "connections": 12,
        "type": "pattern"
      }
    ],
    "densestAreas": [
      {
        "concept": "Error Handling",
        "density": 0.85
      }
    ]
  },
  "topIssues": [
    {
      "pattern": "High Error Rate",
      "frequency": 5,
      "severity": "critical"
    }
  ],
  "recentLearnings": [
    "Database connections recover best with 30-second timeout",
    "Deployment errors decrease with pre-deployment smoke tests",
    "Memory usage correlates with active service count"
  ]
}
```

**Query Parameters:** None

**Status Codes:**
- `200 OK` - Summary retrieved
- `500 Internal Server Error` - Database error

---

### GET /api/knowledge/export

Export knowledge base in specified format.

**Query Parameters:**
- `format=json|markdown` (default: `markdown`)

**Response (JSON):**
```json
{
  "KB-2026-02-23-001": {
    "title": "High Error Rate Pattern",
    "category": "alert_pattern",
    "severity": "critical",
    "solution": "Check recent deployment and rollback if needed",
    "frequency": 5,
    "tags": ["errors", "deployment"]
  }
}
```

**Response (Markdown):**
```markdown
# Knowledge Base Export

## Alert Patterns (5 entries)

### High Error Rate Pattern
- **ID:** KB-2026-02-23-001
- **Severity:** Critical
- **Frequency:** 5 occurrences
- **Solution:** Check recent deployment and rollback if needed

### ...more entries...
```

**Status Codes:**
- `200 OK` - Export successful
- `400 Bad Request` - Invalid format parameter
- `500 Internal Server Error` - Export error

---

## Persistence Endpoints (Phase 6)

### GET /api/persistence/health

Check MongoDB persistence layer health and collection status.

**Response:**
```json
{
  "status": "healthy",
  "database": true,
  "collections": 9
}
```

**Status Values:**
- `healthy` - All services operational
- `degraded` - Some services slow but operational
- `unhealthy` - Database disconnected

**Status Codes:**
- `200 OK` - Always returns (even if unhealthy)
- `500 Internal Server Error` - Fatal error

---

### GET /api/persistence/historical

Query historical data across time periods.

**Query Parameters:**
- `days=N` (default: 30) - Look back N days

**Response:**
```json
{
  "period": {
    "startDate": "2026-01-24T11:10:17.143Z",
    "endDate": "2026-02-23T11:10:17.166Z",
    "days": 30
  },
  "metricsCount": 1250,
  "alertsCount": 45,
  "knowledgeBase": {
    "total": 12,
    "byCategory": {
      "alert_pattern": 5,
      "metric_anomaly": 3,
      "optimization": 2,
      "troubleshooting": 2,
      "runbook": 0
    },
    "bySeverity": {
      "critical": 2,
      "warning": 8,
      "info": 2
    }
  },
  "consolidations": 30
}
```

**Status Codes:**
- `200 OK` - Query successful
- `400 Bad Request` - Invalid days parameter
- `500 Internal Server Error` - Database error

---

### GET /api/persistence/export

Export database statistics and metadata.

**Response:**
```json
{
  "exportDate": "2026-02-23T11:10:17.211Z",
  "collections": {
    "metrics": 1250,
    "alerts": 45,
    "knowledge_base": 12,
    "consolidations": 30,
    "snapshots": 720,
    "system_state": 8,
    "audit_logs": 156,
    "concepts": 34,
    "concept_links": 78
  },
  "databaseSizeBytes": 52428800,
  "databaseSizeMB": "50.00"
}
```

**Status Codes:**
- `200 OK` - Export successful
- `500 Internal Server Error` - Database error

---

## Data Models

### MetricDocument
```typescript
{
  _id?: string;
  name: string;                    // e.g., "response_time_p95"
  value: number;                   // Numeric value
  unit: string;                    // e.g., "ms", "bytes", "percent"
  timestamp: Date;                 // Data point timestamp
  labels?: {[key: string]: string}; // e.g., {"service": "api", "region": "us-east"}
  retention?: "day" | "week" | "month" | "quarter" | "year";
}
```

### AlertDocument
```typescript
{
  _id?: string;
  name: string;                    // e.g., "HighErrorRate"
  severity: "info" | "warning" | "critical";
  status: "firing" | "resolved";
  message: string;                 // Alert message
  fingerprint: string;             // Unique ID for deduplication
  timestamp: Date;                 // When alert was created
  resolvedAt?: Date;               // When alert was resolved
  duration?: number;               // Duration in milliseconds
  labels?: {[key: string]: string};
  annotations?: {[key: string]: string};
}
```

### KBDocument
```typescript
{
  _id?: string;
  id: string;                      // e.g., "KB-2026-02-23-001"
  title: string;
  category: "alert_pattern" | "metric_anomaly" | "optimization" | "troubleshooting" | "runbook";
  severity: "info" | "warning" | "critical";
  solution: string;                // Solution text
  steps?: string[];                // Step-by-step instructions
  expectedOutcome?: string;        // What should happen
  tags?: string[];                 // For searching
  relatedConcepts?: string[];      // Related concept IDs
  frequency?: number;              // How many times observed
  lastSeen?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### ConsolidationDocument
```typescript
{
  _id?: string;
  date: string;                    // "2026-02-23"
  timestamp: Date;
  snapshots: {
    count: number;                 // Number of hourly snapshots
    timeRange: {start: Date; end: Date};
  };
  alerts: {
    total: number;
    bySeverity: {[severity: string]: number};
    topIssues: Array<{name: string; count: number; severity: string}>;
  };
  metrics: {
    total: number;
    anomalies: Array<{name: string; value: number; threshold: number; deviation: number}>;
    trends: Array<{name: string; direction: "up" | "down" | "stable"; changePercent: number}>;
  };
  summary: string;
  insights: string[];
  recommendations: string[];
  kbEntriesGenerated?: number;
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error description",
  "code": "ERROR_CODE",
  "timestamp": "2026-02-23T11:10:17.143Z"
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| INVALID_REQUEST | 400 | Missing or invalid parameters |
| UNAUTHORIZED | 401 | Authentication required |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Resource conflict (e.g., duplicate) |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |

---

## Rate Limiting

**Recommended Limits:**
- `/api/knowledge/*` - 100 req/sec
- `/api/persistence/*` - 50 req/sec
- `/webhook/alerts` - 1000 req/sec (batched)

**Implementation:** Add middleware to `index.ts`
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100               // 100 requests per minute
});

app.use('/api/', limiter);
```

---

## Pagination

For endpoints returning large result sets:

**Query Parameters:**
- `limit=N` (default: 20, max: 100)
- `offset=N` (default: 0)

**Response:**
```json
{
  "data": [...],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 150,
    "hasMore": true,
    "nextOffset": 20
  }
}
```

---

## Sorting

For queryable endpoints:

**Query Parameters:**
- `sort=field` (ascending)
- `sort=-field` (descending)

Example: `/api/knowledge/summary?sort=-frequency`

---

## Filtering

For queryable endpoints:

**Query Parameters:**
- `filter[field]=value`
- `filter[field][$gte]=value` - Greater than or equal
- `filter[field][$lte]=value` - Less than or equal

Examples:
- `/api/persistence/historical?filter[days]=30`
- `/api/knowledge/summary?filter[severity]=critical`

---

## Webhooks

### Alert Webhook Retry Policy

If webhook fails, retries with exponential backoff:
- Attempt 1: Immediate
- Attempt 2: After 10 seconds
- Attempt 3: After 60 seconds
- Attempt 4: After 300 seconds

Max 4 retries before dropping the alert.

### Webhook Signature Verification

(Recommended for production)

```
X-Signature: sha256=<HMAC-SHA256(body, secret)>
```

---

## OpenAPI/Swagger

Generate OpenAPI 3.0 spec:

```bash
npm run generate:openapi
```

Swagger UI available at: http://localhost:3000/swagger

---

## Changelog

### v1.0.0 (February 23, 2026)
- Initial release
- All 8 phases complete
- 6 complete API endpoints
- 9 MongoDB collections
- Full knowledge graph support

---

**Documentation Last Updated:** February 23, 2026  
**Version:** 1.0.0  
**Maintainer:** OpenClaw Team

