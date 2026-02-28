# OPERATOR GUIDE

## Service inventory (from docker compose config)

Computed service lists:

- Root stack (`docker-compose -f docker-compose.yml config --services`): `orchestrator`.
- Full orchestrator stack (`docker-compose -f orchestrator/docker-compose.yml config --services`): `mongo`, `redis`, `orchestrator`, `prometheus`, `grafana`, `alertmanager`.

Evidence: [docker-compose.yml](../docker-compose.yml#L3-L29), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L3-L174)

---

## 1) What is running

## A. Root stack (single service)

### Service: orchestrator
- Purpose: Run orchestrator app container from `./orchestrator` build context. ([docker-compose.yml](../docker-compose.yml#L4-L8))
- Image/build: built from `context: ./orchestrator`, `dockerfile: Dockerfile`. ([docker-compose.yml](../docker-compose.yml#L5-L8))
- Ports: `3000:3000`. ([docker-compose.yml](../docker-compose.yml#L17-L18))
- Env vars:
  - `NODE_ENV=production`: runtime mode.
  - `LOG_LEVEL=info`: logging verbosity.
  ([docker-compose.yml](../docker-compose.yml#L14-L16))
- Volumes:
  - `./orchestrator/logs:/app/logs` (runtime logs)
  - `./orchestrator/data:/app/data` (runtime data)
  - `./orchestrator/orchestrator_config.json:/app/orchestrator_config.json:ro` (read-only config)
  ([docker-compose.yml](../docker-compose.yml#L10-L13))
- Healthcheck: file-based check for `/app/orchestrator_state.json` every 30s, 10s timeout, 3 retries, 40s start period. ([docker-compose.yml](../docker-compose.yml#L20-L25))
- Depends on: none declared. ([docker-compose.yml](../docker-compose.yml#L3-L29))

## B. Full orchestrator stack

### Service: orchestrator
- Purpose: main API + scheduler + task runtime. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L5-L44), [orchestrator/src/index.ts](../orchestrator/src/index.ts#L375-L383))
- Image/build: built from `context: .`, `dockerfile: Dockerfile`. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L6-L8))
- Ports: `3000:3000`. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L10-L11))
- Env vars:
  - `NODE_ENV`, `LOG_LEVEL`, `PORT` (runtime mode/logging/listen port)
  - `OPENAI_API_KEY` (**secret**), `ANTHROPIC_API_KEY` (**secret**) (LLM credentials)
  - `DATABASE_URL` (Mongo connection URI)
  - `REDIS_URL` (Redis connection URI)
  - `PROMETHEUS_ENABLED`, `PROMETHEUS_PORT`, `GRAFANA_ENABLED`, `GRAFANA_PORT` (monitoring toggles/ports)
  ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L12-L27))
- Additional runtime-required secrets from app startup checks:
  - `API_KEY` (**secret**), `WEBHOOK_SECRET` (**secret**), `MONGO_PASSWORD` (**secret**), `REDIS_PASSWORD` (**secret**), `MONGO_USERNAME` (credential)
  ([orchestrator/src/index.ts](../orchestrator/src/index.ts#L27-L35))
- Volumes:
  - `./logs:/app/logs`
  - `./data:/app/data`
  - `./src:/app/src`
  ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L33-L36))
- Healthcheck: `curl -f http://localhost:3000/health`, interval 30s, timeout 10s, retries 3, start period 40s. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L40-L44))
- Dependencies: waits for healthy `mongo` and `redis`. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L28-L32))

### Service: mongo
- Purpose: persistent database for state/audit/history. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L48-L76))
- Image/build: `mongo:7.0.3`. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L49-L49))
- Ports: `127.0.0.1:27017:27017` (bound to localhost only). ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L51-L52))
- Env vars:
  - `MONGO_INITDB_ROOT_USERNAME` (credential)
  - `MONGO_INITDB_ROOT_PASSWORD` (**secret**)
  ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L53-L55))
- Volumes:
  - `mongo-data:/data/db` (persistent DB data)
  - `./mongo-init.js:/docker-entrypoint-initdb.d/mongo-init.js:ro` (init script)
  ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L57-L59))
- Healthcheck: `mongosh ... db.adminCommand('ping')`. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L63-L67))
- Dependencies: none declared.

### Service: redis
- Purpose: cache/session store. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L78-L102))
- Image/build: `redis:7.0.10-alpine`. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L79-L79))
- Ports: `127.0.0.1:6379:6379` (localhost only). ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L81-L82))
- Env vars: none directly on service key; command requires `${REDIS_PASSWORD}` (**secret**). ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L83-L83))
- Volumes:
  - `redis-data:/data` (persistent append-only data)
  ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L84-L85))
- Healthcheck: `redis-cli --raw incr ping`. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L89-L93))
- Dependencies: none declared.

### Service: prometheus
- Purpose: scrape metrics and evaluate alert rules. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L104-L123), [orchestrator/monitoring/prometheus.yml](../orchestrator/monitoring/prometheus.yml#L19-L37))
- Image/build: `prom/prometheus:v2.48.0`. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L105-L105))
- Ports: `127.0.0.1:9090:9090` (localhost only). ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L107-L108))
- Env vars: none in compose for this service.
- Volumes:
  - `./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro`
  - `./monitoring/alert-rules.yml:/etc/prometheus/alert-rules.yml:ro`
  - `prometheus-data:/prometheus` (TSDB persistence)
  ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L109-L112))
- Healthcheck: none declared.
- Dependencies: depends on `orchestrator`. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L121-L122))

### Service: grafana
- Purpose: dashboards/visualization UI. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L125-L143))
- Image/build: `grafana/grafana:10.2.2`. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L126-L126))
- Ports: `127.0.0.1:3001:3000` (localhost only). ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L128-L129))
- Env vars:
  - `GF_SECURITY_ADMIN_USER` (admin username)
  - `GF_SECURITY_ADMIN_PASSWORD` (**secret**)
  - `GF_INSTALL_PLUGINS`
  ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L130-L133))
- Volumes:
  - `./monitoring/dashboards:/etc/grafana/provisioning/dashboards:ro`
  - `./monitoring/datasources.yml:/etc/grafana/provisioning/datasources/datasources.yml:ro`
  - `grafana-data:/var/lib/grafana` (persistent state)
  ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L134-L137))
- Healthcheck: none declared.
- Dependencies: depends on `prometheus`. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L141-L142))

### Service: alertmanager
- Purpose: alert routing/notification manager. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L145-L158), [orchestrator/monitoring/prometheus.yml](../orchestrator/monitoring/prometheus.yml#L8-L13))
- Image/build: `prom/alertmanager:v0.26.0`. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L146-L146))
- Ports: `127.0.0.1:9093:9093` (localhost only). ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L148-L149))
- Env vars: none declared.
- Volumes:
  - `./monitoring/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro`
  - `alertmanager-data:/alertmanager` (persistent state)
  ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L150-L152))
- Healthcheck: none declared.
- Dependencies: none declared.

---

## 2) How to start/stop

Use root stack (single orchestrator):
- Start: `docker-compose -f docker-compose.yml up -d`
- Logs: `docker-compose -f docker-compose.yml logs -f`
- Stop/remove containers + network: `docker-compose -f docker-compose.yml down`
- Stop/remove including named volumes: `docker-compose -f docker-compose.yml down -v`
  - Data loss warning: removes named volumes in that compose project; for root file this is mostly bind-mounted paths (`./orchestrator/logs`, `./orchestrator/data`) so host files remain, but any named volumes in scope would be deleted. ([docker-compose.yml](../docker-compose.yml#L10-L13))

Use full stack:
- Start: `docker-compose -f orchestrator/docker-compose.yml up -d`
- Logs: `docker-compose -f orchestrator/docker-compose.yml logs -f`
- Stop/remove containers + network: `docker-compose -f orchestrator/docker-compose.yml down`
- Stop/remove including data volumes: `docker-compose -f orchestrator/docker-compose.yml down -v`
  - Data loss warning: deletes named persistent volumes `mongo-data`, `redis-data`, `prometheus-data`, `grafana-data`, `alertmanager-data`. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L160-L170))

Related app scripts:
- Local app start (no compose): `npm run start` from orchestrator package. ([orchestrator/package.json](../orchestrator/package.json#L8-L9))

---

## 3) How to verify

For full stack (host machine URLs):

- Orchestrator health: `http://localhost:3000/health`
  - Expected: JSON with `status: "healthy"` and endpoint hints for metrics/knowledge/persistence.
  - Evidence: route and response fields. ([orchestrator/src/index.ts](../orchestrator/src/index.ts#L242-L249))

- Orchestrator knowledge summary: `http://localhost:3000/api/knowledge/summary`
  - Expected: JSON summary object; HTTP 200 means API path is serving.
  - Evidence: public route registration. ([orchestrator/src/index.ts](../orchestrator/src/index.ts#L253-L261))

- Orchestrator persistence health: `http://localhost:3000/api/persistence/health`
  - Expected: JSON with DB health; HTTP 200 indicates persistence check path succeeded.
  - Evidence: public route registration. ([orchestrator/src/index.ts](../orchestrator/src/index.ts#L264-L271))

- Prometheus UI: `http://localhost:9090`
  - Expected: Prometheus web UI loads; target `orchestrator:9100` should be up in Targets page.
  - Evidence: port mapping and scrape target. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L107-L108), [orchestrator/monitoring/prometheus.yml](../orchestrator/monitoring/prometheus.yml#L21-L24))

- Grafana UI: `http://localhost:3001`
  - Expected: Grafana login page; credentials from `GF_SECURITY_ADMIN_USER` and `GF_SECURITY_ADMIN_PASSWORD`.
  - Evidence: port and env keys. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L128-L133))

- Alertmanager UI/API: `http://localhost:9093`
  - Expected: Alertmanager status page/API response.
  - Evidence: port mapping. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L148-L149))

Internal-only metric endpoint (inside compose network/container):
- `http://orchestrator:9100/metrics` (scraped by Prometheus) and `http://orchestrator:9100/health`.
- Evidence: metrics server binds port 9100 and exposes these routes. ([orchestrator/src/metrics/prometheus.ts](../orchestrator/src/metrics/prometheus.ts#L164-L176), [orchestrator/monitoring/prometheus.yml](../orchestrator/monitoring/prometheus.yml#L21-L27))

---

## 4) Common failures

### A. Port already in use
Symptoms:
- `bind: address already in use` during compose startup.

Likely conflicting host ports:
- 3000 (orchestrator), 3001 (Grafana), 9090 (Prometheus), 9093 (Alertmanager), 27017 (Mongo localhost), 6379 (Redis localhost). ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L10-L11), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L51-L52), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L81-L82), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L107-L108), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L128-L129), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L148-L149))

Fix steps:
1. Identify conflict: `sudo lsof -i :3000,:3001,:9090,:9093,:27017,:6379`.
2. Stop conflicting process or change host-side port in compose.
3. Re-run `docker-compose ... up -d`.

### B. Containers restarting continuously
Symptoms:
- `docker-compose ps` shows restart loop.

Potential causes:
- Healthcheck failing (orchestrator/mongo/redis). ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L40-L44), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L63-L67), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L89-L93))
- App startup exits due missing required env vars. ([orchestrator/src/index.ts](../orchestrator/src/index.ts#L27-L41))

Fix steps:
1. Inspect logs: `docker-compose -f orchestrator/docker-compose.yml logs -f orchestrator mongo redis`.
2. Verify required env vars are set (`API_KEY`, `WEBHOOK_SECRET`, `MONGO_PASSWORD`, `REDIS_PASSWORD`, `MONGO_USERNAME`).
3. Confirm healthcheck endpoint/commands are reachable from within each container.

### C. Mongo not ready
Symptoms:
- Orchestrator waits/fails around DB connection or dependency health.

Evidence:
- Orchestrator depends on healthy `mongo`. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L28-L31))
- Mongo healthcheck requires valid credentials in command. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L63-L67))

Fix steps:
1. Ensure `MONGO_USERNAME`/`MONGO_PASSWORD` values are set and consistent.
2. Check mongo logs: `docker-compose -f orchestrator/docker-compose.yml logs -f mongo`.
3. If initial auth/bootstrap is corrupted, stop stack and evaluate whether to recreate `mongo-data` volume (destructive).

### D. Missing env vars
Symptoms:
- Fatal startup error indicating missing credentials.

Evidence:
- App enforces required env list at startup and throws if missing. ([orchestrator/src/index.ts](../orchestrator/src/index.ts#L27-L41))

Fix steps:
1. Create/provide `.env` values for all required secrets and credentials.
2. Confirm compose interpolation variables used by services (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `MONGO_USERNAME`, `MONGO_PASSWORD`, `REDIS_PASSWORD`, `GRAFANA_PASSWORD`). ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L17-L18), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L54-L55), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L83-L83), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L132-L132))
3. Restart stack after env correction.

### E. Volume permission issues
Symptoms:
- Write failures for logs/data directories.

Evidence:
- Services mount host bind paths and named volumes. ([docker-compose.yml](../docker-compose.yml#L10-L13), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L33-L36), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L57-L59), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L84-L85))
- Orchestrator image runs as non-root user `orchestrator` in Dockerfile. ([orchestrator/Dockerfile](../orchestrator/Dockerfile#L81-L81))

Fix steps:
1. Ensure host directories exist and are writable by container user/group.
2. On Linux, align ownership/permissions for mounted paths.
3. Recreate problematic container after permission fix.

---

## 5) Safe defaults for shipping

- Bind admin/data-plane UIs to localhost only.
  - Already done for Mongo, Redis, Prometheus, Grafana, Alertmanager via `127.0.0.1:...` host bindings. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L51-L52), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L81-L82), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L107-L108), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L128-L129), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L148-L149))

- Do not expose Mongo publicly.
  - Keep `127.0.0.1:27017:27017` or remove host publish entirely if app is co-located in compose network. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L51-L52))

- Keep secrets in environment files, never in repository.
  - Compose expects interpolated secret vars for API keys/passwords. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L17-L18), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L54-L55), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L83-L83), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L132-L132))
  - App fails closed when required credentials are absent. ([orchestrator/src/index.ts](../orchestrator/src/index.ts#L27-L41))

- Minimal firewall baseline (host level):
  - Allow inbound only to intentionally exposed app endpoints (typically 3000 if public API is needed).
  - Keep 27017/6379/9090/9093/3001 restricted to loopback or private admin network.
  - This aligns with existing localhost bindings in compose. ([orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L51-L52), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L81-L82), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L107-L108), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L128-L129), [orchestrator/docker-compose.yml](../orchestrator/docker-compose.yml#L148-L149))

---

## Dockerfile/runtime notes for operators

- Root Dockerfile runs `node dist/index.js` with dumb-init and file-based healthcheck. ([../Dockerfile](../Dockerfile#L38-L45))
- Orchestrator Dockerfile runs as non-root user, exposes 3000, and healthchecks `/health`. ([orchestrator/Dockerfile](../orchestrator/Dockerfile#L74-L97))
- Package scripts for local dev/ops are in orchestrator package (`build`, `start`, `dev`, `test:run`, `test:integration`, `test:load`). ([orchestrator/package.json](../orchestrator/package.json#L7-L14))
