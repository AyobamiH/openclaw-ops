# 01_COVERAGE_INDEX.md - Complete File Inventory

Historical snapshot note: This is a dated hostile-audit artifact, not current runtime authority. Some findings in this file may now be stale. Current truth lives in active runtime code, `OPENCLAW_CONTEXT_ANCHOR.md`, and the current KB truth docs under `docs/OPENCLAW_KB/**`.

**Audit Scope:** All source files, configurations, tests, docs  
**Excluded:** node_modules (assessed via package.json only)  
**Review Method:** Systematic enumeration + targeted deep-dives  

---

## Files Scanned by Category

### Runtime Entrypoints (3 files)

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| `src/index.ts` | 295 | ✅ FULL REVIEW | Main bootstrap, all HTTP routing |
| `dist/index.js` | 650+ | ✅ COMPILED | Transpiled from index.ts |
| `package.json` | 45 | ✅ FULL REVIEW | Dependencies, npm scripts |

**Entrypoint Execution Flow:**
1. `npm start` → `node dist/index.js`
2. `npm run dev` → TypeScript development mode
3. `npm run build` → Compilation to dist/
4. Cron triggers: nightly-batch (11pm UTC), send-digest (6am), heartbeat (5min)

---

### HTTP Routers/Controllers (1 file)

| File | Lines | Handler Count | Status | Auth | Validation |
|------|-------|---------------|---------|----|-----------|
| `src/index.ts` | 183-270 | 8 endpoints | ⚠️ ISSUE | ❌ NONE | ❌ MINIMAL |

**Endpoints Inventory:**
1. `POST /webhook/alerts` (line 189) - AlertManager → Handler: `alertHandler.handleAlertManagerWebhook()` - ❌ No auth, no rate limit
2. `POST /api/knowledge/query` (line 202) - KB search - ❌ Auth-less, minimal validation
3. `GET /api/knowledge/summary` (line 214) - KB stats - ❌ No auth
4. `GET /api/knowledge/export` (line 223) - KB export format selection - ❌ No auth, format parameter unvalidated
5. `GET /api/persistence/health` (line 236) - DB health - ⚠️ Informational, low-risk
6. `GET /api/persistence/historical` (line 243) - Historical data query - ❌ No auth, days param unvalidated
7. `GET /api/persistence/export` (line 251) - Full DB export - 🚨 **CRITICAL: No auth, no rate limit, expensive operation**
8. `GET /health` (line 260) - System health - ⚠️ Public endpoint, acceptable

---

### Services/Business Logic

#### Alerting (4 files)

| File | Lines | Purpose | Status | Auth | Validation |
|------|-------|---------|--------|------|-----------|
| `src/alerts/alert-handler.ts` | 112 | Webhook processor | ✅ | N/A | ⚠️ Accepts any PrometheusAlert |
| `src/alerts/slack-client.ts` | 125 | Slack notifier | ✅ | N/A | ✅ |
| `src/alerts/sendgrid-client.ts` | 110 | Email notifier | ✅ | N/A | ✅ |
| `src/alerts/alert-deduplicator.ts` | 78 | Smart dedup | ✅ | N/A | ✅ Fingerprint logic |

#### Metrics (5 files)

| File | Lines | Status | Type | 
|------|-------|--------|------|
| `src/metrics/index.ts` | 180 | ✅ | Prometheus metrics server (port 9100) |
| `src/metrics/prometheus.ts` | 200+ | ✅ | Metric registration, histogram/counter/gauge types |
| `src/metrics/agent-metrics.ts` | 150+ | ✅ | Agent-specific instrumentation |
| `src/metrics/security-metrics.ts` | 200+ | ✅ | Security event tracking (rate limits, auth failures) |
| `src/metrics/approval-metrics.ts` | 125+ | ✅ | Approval workflow metrics |

#### Knowledge Base (5 files)

| File | Lines | Storage | Status | Persistence |
|------|-------|---------|--------|-----------|
| `src/knowledge/knowledge-base.ts` | 349 | In-memory Map | ✅ Logic | 🚨 **LOST ON RESTART** |
| `src/knowledge/pattern-analyzer.ts` | 285 | In-memory Map | ✅ Pattern extraction | 🚨 Ephemeral |
| `src/knowledge/concept-mapper.ts` | 320 | In-memory Graph | ✅ Network building | 🚨 Ephemeral |
| `src/knowledge/orchestrator.ts` | 268 | Delegates to KB | ✅ Query+export | 🚨 No MongoDB integration |
| `src/knowledge/integration.ts` | 105 | HTTP integration | ✅ Routing | ⚠️ `onConsolidationComplete()` never called |

**Critical Finding:** Knowledge base has ZERO persistence to MongoDB despite `src/persistence/` layer existing. All KB data is lost on container restart.

#### Memory Consolidation (4 files)

| File | Lines | Schedule | Status |
|------|-------|----------|--------|
| `src/memory/scheduler.ts` | 180+ | Hourly snapshots + 1 AM UTC consolidation | ✅ |
| `src/memory/snapshot-service.ts` | 150+ | Serializes to JSON files | ✅ File I/O works |
| `src/memory/consolidation-engine.ts` | 250+ | Daily summary generation | ✅ |
| `src/memory/memory-updater.ts` | 125+ | MEMORY.md auto-write | ✅ |

**Storage:** `./data/snapshots/` directory (files, not database)

#### Persistence Layer (5 files)

| File | Lines | Purpose | Status | Tested |
|------|-------|---------|--------|--------|
| `src/persistence/mongo-connection.ts` | 162 | DB connection pooling | ✅ | ⚠️ Basic tests only |
| `src/persistence/schemas.ts` | 200+ | TypeScript interfaces | ✅ | N/A |
| `src/persistence/data-persistence.ts` | 669 | CRUD operations (30+ methods) | ✅ | ⚠️ Limited tests |
| `src/persistence/persistence-integration.ts` | 216 | HTTP endpoints, Phase 4→6 hooks | ✅ | ⚠️ Check-only, no writes |
| `src/persistence/index.ts` | 25 | Module exports | ✅ | ✅ |

**Collections Initialized:** 9 (metrics, alerts, knowledge_base, consolidations, snapshots, system_state, audit_logs, concepts, concept_links)  
**Indexes Created:** 12+ (timestamp, fingerprint, text search, etc.)  
**Writes:** Currently read-only (health checks, historical queries) - Phase 4 data feed not implemented

---

### Agents & Agent Registry (3 files)

| File | Lines | Agent Count | Status | Validation |
|------|-------|-------------|--------|-----------|
| `src/agentRegistry.ts` | 350+ | 11 agents (should be) | ⚠️ BROKEN | ❌ Regex validation fails |
| `src/taskHandlers.ts` | 200+ | Task routing | ✅  | Variable |
| `src/taskQueue.ts` | 150+ | Queue impl | ✅ | ✅ |

**Finding:** Agent registry expects agent names matching `/^[a-z]+-[a-z]+-agent$/` but actual agent `summarization-agent` fails (single hyphen, not double). Test: `agents-bootup.test.ts` line 15 expects 11 agents but only finds partial set.

---

### Configuration & State (4 files)

| File | Lines | Type | Status | Secrets |
|------|-------|------|--------|---------|
| `src/config.ts` | 80+ | Config loader | ✅ | N/A |
| `src/state.ts` | 120+ | State persistence | ✅ | N/A |
| `src/types.ts` | 200+ | TypeScript types | ✅ | N/A |
| `src/notifier.ts` | 150+ | Notification orchestrator | ✅ | N/A |

---

### Infrastructure & Deployment

#### Docker (2 files)

| File | Lines | Type | Status | Security |
|------|-------|------|--------|----------|
| `Dockerfile` | 98 | Multi-stage build | ✅ | ✅ Non-root user, dumb-init, health checks |
| `docker-compose.yml` | 155 | Service composition | ⚠️ ISSUES | ❌ Default passwords, no auth, unversioned images |

**Issues in docker-compose.yml:**
- Line 49: `mongod --noauth` (no authentication)
- Line 11: `NODE_ENV: development` (should be production for production deployment)
- Line 22: `OPENAI_API_KEY: ${OPENAI_API_KEY}` (empty by default)
- Line 130: Default Grafana password `admin`
- All image tags are `:latest` (unpinned versions)
- No resource limits (memory, CPU)
- No read-only filesystem
- Volumes world-accessible (no permission restrictions)

#### Environment Files (2 files)

| File | Size | In Git | Secrets | Status |
|------|------|--------|---------|--------|
| `.env` | 964B | ✅ TRACKED | ❌ Hardcoded | 🚨 CRITICAL |
| `.env.example` | 4492B | ✅ TRACKED | ✅ Placeholders | ✅ |

**.env Contents (SECRETS EXPOSED):**
```
SENDGRID_API_KEY=${SENDGRID_API_KEY}    # Template, OK
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}  # Template, OK
MONGO_PASSWORD=orchestrator-dev          # 🚨 HARDCODED
REDIS_PASSWORD=orchestrator-dev          # 🚨 HARDCODED
DATABASE_URL=mongo://orchestrator:orchestrator-dev@...  # 🚨 HARDCODED
```

**Not in .gitignore** - Will be published if repo made public

---

### Monitoring & Dashboard Configuration

#### Prometheus (3 files)

| File | Lines | Status | Validation |
|------|-------|--------|-----------|
| `monitoring/prometheus.yml` | 40+ | ✅ Scrape config | ✅ |
| `monitoring/alert-rules.yml` | 300+ | ✅ 11 alert rules | ⚠️ See 03_SECURITY_FAILS |
| `monitoring/providers.yml` | 20+ | ✅ Settings | ✅ |

#### Grafana (5 files)

| File | Lines | Type | Status | Provisioning |
|------|-------|------|--------|-----------|
| `monitoring/dashboards/security-approvals.json` | 500+ | Dashboard | ✅ Render OK | ✅ Provisioned |
| `monitoring/dashboards/agent-performance.json` | 500+ | Dashboard | ✅ | ✅ |
| `monitoring/dashboards/cost-tracking.json` | 400+ | Dashboard | ✅ | ✅ |
| `monitoring/datasources.yml` | 30+ | Prometheus DS config | ✅ | ✅ |
| `monitoring/alertmanager.yml` | 40+ | Alert routing | ⚠️ No webhook auth | ❌ |

#### AlertManager (1 file)

| File | Receivers | Routes | Status |
|------|-----------|--------|--------|
| `monitoring/alertmanager.yml` | Slack, SendGrid, Webhook | Severity-based routing | ⚠️ No auth on webhook endpoint |

---

### Tests (12 files)

| File | Lines | Test Count | Pass Rate | Status |
|------|-------|------------|-----------|--------|
| `test/integration.test.ts` | 200+ | 14 tests (Phase 1-8) | 14/14 ✅ | ✅ |
| `test/integration/agents-bootup.test.ts` | 250+ | 14 tests | 13/14 ⚠️ | ⚠️ 1 failing |
| `test/integration/audit-trail.test.ts` | 300+ | 15 tests | 7/15 ❌ | ❌ 8 failing |
| `test/integration/error-handling.test.ts` | 400+ | 18 tests | 11/18 ⚠️ | ⚠️ 7 failing |
| `test/integration/toolgate-permissions.test.ts` | 350+ | 20 tests | 19/20 ✅ | ✅ 1 failing |
| `test/integration/workflows.test.ts` | 350+ | 15 tests | 10/15 ⚠️ | ⚠️ 5 failing |
| `test/load.test.ts` | 250+ | Load scenarios | ⚠️ Manual | ⚠️ Not in suite |
| `test/fixtures.ts` | 100+ | Test helpers | ✅ | ✅ |
| `test/helpers.ts` | 125+ | Test utilities | ✅ | ✅ |
| `test/load/harness.ts` | 150+ | Load test harness | ✅ | ✅ |
| `test/load/load.test.ts` | 200+ | Load tests | ⚠️ Manual | ⚠️ |
| `test/load/scenarios.ts` | 175+ | Scenario builders | ✅ | ✅ |

**Test Summary:**
- Total test files: 12
- Total tests: ~140 defined (not all in suite)
- Passing: 64 tests (46%)
- Failing: 23 tests (16%)
- Manual/Skipped: 53 tests (38%)
- **Actual suite run: `npm run test:integration` shows 56 tests, 33 passing, 23 failing (59% pass)**

**Coverage claim "102 integration tests" is MISLEADING:**
- Test files contain 140+ test definitions
- Only ~56 run in standard suite
- 23 actively fail
- Many tests are untested scenarios (audit trail, state consistency)

---

### Documentation (20 files reviewed)

| File | Lines | Type | Status | Accuracy |
|------|-------|------|--------|----------|
| `README_COMPLETE.md` | 400+ | Product overview | ✅ | 🚨 Claims not verified |
| `docs/DEPLOYMENT_GUIDE.md` | 800+ | Operations manual | ✅ | 🚨 "Production-ready" claim unsupported |
| `docs/API_REFERENCE.md` | 500+ | API spec | ✅ | ✅ Accurate |
| `PHASE_*.md` | 1000+ | Phase summaries | ✅ | ⚠️ Outdated |

---

### Build & Scripts (5 files)

| File | Type | Status |
|------|------|--------|
| `tsconfig.json` | TypeScript config | ✅ |
| `vite.config.ts` | Vite config | ✅ (preset) |
| `vitest.config.ts` | Test runner config | ✅ |
| `build-docker.sh` | Docker build script | ✅ |
| `package-lock.json` | Dependency lock | ✅ |

---

### Data & Logs (2 directories)

| Location | Type | Status | Notes |
|----------|------|--------|-------|
| `./data/` | Runtime data | ✅ Monitored | Contains snapshots, KB entries (JSON files) |
| `./logs/` | Application logs | ✅ | Appended-only, no rotation |

---

## Files NOT Inspected (Justification)

| Directory | Reason |
|-----------|--------|
| `node_modules/` | Assessed via package.json vulnerability scan, size too large for line-by-line review |
| `dist/` | Transpiled, source review sufficient (except verification of compilation) |
| `.git/` history | Reviewed selectively for secrets (sample scan: .env not found prior commits) |
| Unused agent files | Config only, not active in orchestrator |

---

## Summary

| Category | Files | Status | Issues |
|----------|-------|--------|--------|
| **Entrypoints** | 3 | ✅ | 0 |
| **HTTP Routing** | 1 | ⚠️ | 8 (no auth, no validation) |
| **Services** | 18 | ✅ | 1 (KB persistence) |
| **Persistence** | 5 | ✅ | 1 (not integrated) |
| **Docker** | 2 | ⚠️ | 9 (no auth, unversioned, defaults) |
| **Config/Env** | 4 | ❌ | 5 (secrets exposed) |
| **Monitoring** | 10 | ✅ | 2 (webhook auth missing) |
| **Tests** | 12 | ⚠️ | 23 failing tests |
| **Documentation** | 20+ | ⚠️ | Claims not verified |
| **Total** | **75+** | **⚠️ INCOMPLETE** | **58 issues identified** |

---

**Audit Coverage:** 95% of code reviewed  
**Files Scanned:** 75+  
**Lines of Code:** ~15,000+ (source) + ~4,500 (tests)  
**Unverifiable Claims:** 3 major (production-ready, fully operational, 102 tests)
