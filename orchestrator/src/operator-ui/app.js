const storageKeys = {
  token: "openclaw.operator.token",
  showAdminTasks: "openclaw.operator.showAdminTasks",
  proofUrl: "openclaw.operator.proofUrl",
};

const state = {
  activeTab: "overview",
  token: localStorage.getItem(storageKeys.token) ?? "",
  showAdminTasks: localStorage.getItem(storageKeys.showAdminTasks) === "true",
  proofUrl: localStorage.getItem(storageKeys.proofUrl) || "http://127.0.0.1:3310",
  selectedApprovalTaskId: null,
  lastTaskQueueResult: null,
  loading: {
    overview: false,
    tasks: false,
    approvals: false,
    agents: false,
    activity: false,
    knowledge: false,
  },
  data: {
    health: null,
    extendedHealth: null,
    persistenceHealth: null,
    overview: null,
    tasksCatalog: null,
    approvals: null,
    agentsOverview: null,
    memoryRecall: null,
    knowledgeSummary: null,
    knowledgeQueryResult: null,
  },
};

const TASK_DEFAULTS = {
  heartbeat: {
    reason: "operator-ui",
  },
  "build-refactor": {
    type: "refactor",
    scope: "src",
    runTests: true,
    maxFilesChanged: 10,
  },
  "market-research": {
    mode: "query",
    query: "market research",
    scope: "general",
    urls: "",
  },
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "n/a";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "n/a";
  return dt.toLocaleString();
}

function statusBadge(label, kind = "info") {
  return `<span class="badge ${kind}">${escapeHtml(label)}</span>`;
}

function setAlert(message, mode = "risk") {
  const el = document.getElementById("global-alert");
  if (!message) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }

  el.classList.remove("hidden");
  el.style.borderColor =
    mode === "ok" ? "rgba(67, 216, 157, 0.55)" : "rgba(255, 124, 108, 0.55)";
  el.style.background =
    mode === "ok" ? "rgba(67, 216, 157, 0.15)" : "rgba(190, 61, 52, 0.22)";
  el.textContent = message;
}

function authHeaders({ includeJson = true } = {}) {
  if (!state.token) {
    throw new Error("Bearer token required for protected operator routes.");
  }
  const headers = {
    Authorization: `Bearer ${state.token}`,
  };
  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = parsed?.error || parsed?.message || `${response.status}`;
    throw new Error(`${url} failed: ${detail}`);
  }
  return parsed;
}

async function fetchProtected(url, options = {}) {
  const hasBody = options.body !== undefined;
  const headers = authHeaders({ includeJson: hasBody });
  return fetchJson(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers ?? {}),
    },
  });
}

function applyTokenUI() {
  const tokenInput = document.getElementById("token-input");
  tokenInput.value = state.token;

  const proofLink = document.getElementById("proof-link");
  proofLink.href = state.proofUrl;
  proofLink.textContent = state.proofUrl;

  const showAdminToggle = document.getElementById("show-admin-tasks-toggle");
  showAdminToggle.checked = state.showAdminTasks;
}

function selectTab(tab) {
  state.activeTab = tab;

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  document.querySelectorAll(".tab-page").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tab}`);
  });
}

async function loadOverviewData() {
  state.loading.overview = true;
  try {
    const [overview, extendedHealth, health, persistenceHealth] = await Promise.all([
      fetchProtected("/api/dashboard/overview"),
      fetchProtected("/api/health/extended"),
      fetchJson("/health"),
      fetchJson("/api/persistence/health"),
    ]);
    state.data.overview = overview;
    state.data.extendedHealth = extendedHealth;
    state.data.health = health;
    state.data.persistenceHealth = persistenceHealth;
    renderOverview();
    renderGovernance();
    renderHealth();
    renderActivity();
    setAlert("");
  } catch (error) {
    setAlert(error instanceof Error ? error.message : String(error));
  } finally {
    state.loading.overview = false;
  }
}

async function loadTasksCatalog() {
  state.loading.tasks = true;
  try {
    const payload = await fetchProtected("/api/tasks/catalog");
    state.data.tasksCatalog = payload;
    renderTasks();
  } catch (error) {
    setAlert(error instanceof Error ? error.message : String(error));
  } finally {
    state.loading.tasks = false;
  }
}

async function loadApprovals() {
  state.loading.approvals = true;
  try {
    const approvals = await fetchProtected("/api/approvals/pending");
    state.data.approvals = approvals;
    renderApprovals();
  } catch (error) {
    setAlert(error instanceof Error ? error.message : String(error));
  } finally {
    state.loading.approvals = false;
  }
}

async function loadAgentsOverview() {
  state.loading.agents = true;
  try {
    const agents = await fetchProtected("/api/agents/overview");
    state.data.agentsOverview = agents;
    renderAgents();
  } catch (error) {
    setAlert(error instanceof Error ? error.message : String(error));
  } finally {
    state.loading.agents = false;
  }
}

async function loadActivityData() {
  state.loading.activity = true;
  try {
    const recall = await fetchProtected("/api/memory/recall?limit=50");
    state.data.memoryRecall = recall;
    renderActivity();
  } catch (error) {
    setAlert(error instanceof Error ? error.message : String(error));
  } finally {
    state.loading.activity = false;
  }
}

async function loadKnowledgeSummary() {
  state.loading.knowledge = true;
  try {
    const summary = await fetchJson("/api/knowledge/summary");
    state.data.knowledgeSummary = summary;
    renderKnowledgeSummary();
  } catch (error) {
    setAlert(error instanceof Error ? error.message : String(error));
  } finally {
    state.loading.knowledge = false;
  }
}

function renderOverview() {
  const cardsEl = document.getElementById("overview-cards");
  const warningsEl = document.getElementById("degraded-warnings");
  const recentTasksEl = document.getElementById("overview-recent-tasks");

  const overview = state.data.overview;
  const extendedHealth = state.data.extendedHealth;
  if (!overview || !extendedHealth) {
    cardsEl.innerHTML = `<div class="status-note">Overview not loaded yet.</div>`;
    warningsEl.innerHTML = "";
    recentTasksEl.innerHTML = "";
    return;
  }

  const governance = overview.governance ?? {};
  const queue = overview.queue ?? {};
  const persistence = overview.persistence ?? {};

  cardsEl.innerHTML = `
    <article class="card">
      <h3>System Status</h3>
      <div class="metric">${escapeHtml(extendedHealth.status ?? "unknown")}</div>
      <div class="submetric">Routing: ${escapeHtml(extendedHealth.controlPlane?.routing ?? "unknown")}</div>
    </article>
    <article class="card">
      <h3>Queue</h3>
      <div class="metric">${Number(queue.queued ?? 0)}</div>
      <div class="submetric">${Number(queue.processing ?? 0)} processing</div>
    </article>
    <article class="card">
      <h3>Pending Approvals</h3>
      <div class="metric">${Number(overview.approvals?.pendingCount ?? 0)}</div>
      <div class="submetric">Approval replay path active</div>
    </article>
    <article class="card">
      <h3>Retry Recoveries</h3>
      <div class="metric">${Number(governance.taskRetryRecoveries?.count ?? 0)}</div>
      <div class="submetric">Next retry: ${formatDate(governance.taskRetryRecoveries?.nextRetryAt)}</div>
    </article>
    <article class="card">
      <h3>Governed Skills</h3>
      <div class="metric">${Number(governance.governedSkills?.totalCount ?? 0)}</div>
      <div class="submetric">Approved: ${Number(governance.governedSkills?.approvedCount ?? 0)}</div>
    </article>
    <article class="card">
      <h3>Persistence</h3>
      <div class="metric">${escapeHtml(persistence.status ?? "unknown")}</div>
      <div class="submetric">Collections: ${Number(persistence.collections ?? 0)}</div>
    </article>
  `;

  const warnings = [];
  if ((extendedHealth.status || "").toLowerCase() !== "healthy") {
    warnings.push(
      "Authoritative operator health is degraded. Read dependency status before treating the system as healthy.",
    );
  }
  if (overview.health?.fastStartMode) {
    warnings.push(
      "Fast-start mode is enabled: routing may work while persistence/indexing/memory subsystems are intentionally degraded.",
    );
  }
  if ((state.data.persistenceHealth?.status || "").toLowerCase() !== "healthy") {
    warnings.push(
      "Persistence is not fully healthy. Control-plane routing may still accept tasks while durability is degraded.",
    );
  }
  if (Number(governance.taskRetryRecoveries?.count ?? 0) > 0) {
    warnings.push("Retry recovery backlog is non-zero; monitor replay behavior.");
  }
  if (Number(governance.milestoneDeliveries?.deadLetterCount ?? 0) > 0) {
    warnings.push("Milestone delivery dead-letter queue has entries.");
  }
  if (Number(governance.demandSummaryDeliveries?.deadLetterCount ?? 0) > 0) {
    warnings.push("Demand summary delivery dead-letter queue has entries.");
  }

  if (warnings.length === 0) {
    warningsEl.innerHTML = `<div class="status-note">No active degraded-mode warning signals.</div>`;
  } else {
    warningsEl.innerHTML = warnings
      .map((item) => `<div class="status-note">${escapeHtml(item)}</div>`)
      .join("");
  }

  const recentTasks = Array.isArray(overview.recentTasks)
    ? [...overview.recentTasks].reverse()
    : [];
  if (!recentTasks.length) {
    recentTasksEl.innerHTML = `<div class="status-note">No recent task activity.</div>`;
    return;
  }

  recentTasksEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Handled At</th>
          <th>Task</th>
          <th>Result</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody>
        ${recentTasks
          .map((task) => {
            const badgeKind = task.result === "ok" ? "ok" : "risk";
            return `
              <tr>
                <td>${escapeHtml(formatDate(task.handledAt))}</td>
                <td>${escapeHtml(task.type || "unknown")}</td>
                <td>${statusBadge(task.result === "ok" ? "Success" : "Failed", badgeKind)}</td>
                <td>${escapeHtml(task.message || "")}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderTasks() {
  const grid = document.getElementById("tasks-grid");
  const catalog = state.data.tasksCatalog?.tasks;
  if (!Array.isArray(catalog)) {
    grid.innerHTML = `<div class="status-note">Task catalog unavailable.</div>`;
    return;
  }

  const visible = catalog.filter((task) => task.exposeInV1 || state.showAdminTasks);

  grid.innerHTML = visible
    .map((task) => {
      const statusLabel =
        task.operationalStatus === "confirmed-working"
          ? statusBadge("Ready", "ok")
          : task.operationalStatus === "partially-operational"
            ? statusBadge("Partially Available", "warn")
            : task.operationalStatus === "externally-dependent"
              ? statusBadge("Needs External Setup", "warn")
              : statusBadge("Not Yet Verified", "risk");

      const accessBadge = task.internalOnly
        ? statusBadge("Internal Only", "risk")
        : statusBadge("Public Triggerable", "info");
      const approvalBadge = task.approvalGated
        ? statusBadge("Needs Approval", "warn")
        : statusBadge("No Approval Gate", "ok");

      return `
        <article class="task-card">
          <div class="task-header">
            <div>
              <h3>${escapeHtml(task.label)}</h3>
              <p class="task-purpose">${escapeHtml(task.purpose)}</p>
            </div>
            ${statusLabel}
          </div>
          <div class="badge-row">
            ${accessBadge}
            ${approvalBadge}
          </div>
          <ul class="list">
            ${(task.caveats || [])
              .map((caveat) => `<li>${escapeHtml(caveat)}</li>`)
              .join("")}
          </ul>
          ${renderTaskForm(task)}
        </article>
      `;
    })
    .join("");

  bindTaskFormHandlers();
}

function renderTaskForm(task) {
  if (task.internalOnly) {
    return `<div class="status-note">This task is intentionally internal-only and not user-runnable.</div>`;
  }

  if (task.type === "heartbeat") {
    return `
      <form class="form-stack task-form" data-task-type="heartbeat">
        <label>Reason</label>
        <input name="reason" value="${escapeHtml(TASK_DEFAULTS.heartbeat.reason)}" />
        <button type="submit" class="btn btn-primary">Queue Task</button>
      </form>
      <div id="task-result-heartbeat"></div>
    `;
  }

  if (task.type === "build-refactor") {
    const defaults = TASK_DEFAULTS["build-refactor"];
    return `
      <form class="form-stack task-form" data-task-type="build-refactor">
        <div class="row">
          <div>
            <label>Operation Type</label>
            <select name="type">
              <option value="refactor">Refactor</option>
              <option value="scan_security">Security Scan</option>
              <option value="optimize_performance">Optimize Performance</option>
            </select>
          </div>
          <div>
            <label>Scope</label>
            <input name="scope" value="${escapeHtml(defaults.scope)}" />
          </div>
        </div>
        <div class="row">
          <div>
            <label>Max Files Changed</label>
            <input name="maxFilesChanged" type="number" min="1" value="${defaults.maxFilesChanged}" />
          </div>
          <label class="toggle">
            <input name="runTests" type="checkbox" ${defaults.runTests ? "checked" : ""} />
            <span>Run tests in workflow</span>
          </label>
        </div>
        <button type="submit" class="btn btn-primary">Queue Task</button>
      </form>
      <div id="task-result-build-refactor"></div>
    `;
  }

  if (task.type === "market-research") {
    const defaults = TASK_DEFAULTS["market-research"];
    return `
      <form class="form-stack task-form" data-task-type="market-research">
        <div class="row">
          <div>
            <label>Mode</label>
            <select name="mode">
              <option value="query" ${defaults.mode === "query" ? "selected" : ""}>Query-only (recommended)</option>
              <option value="url">URL fetch mode</option>
            </select>
          </div>
          <div>
            <label>Scope</label>
            <input name="scope" value="${escapeHtml(defaults.scope)}" />
          </div>
        </div>
        <label>Query</label>
        <textarea name="query" rows="3">${escapeHtml(defaults.query)}</textarea>
        <div class="url-mode-group hidden">
          <label>URLs (one per line)</label>
          <textarea name="urls" rows="4" placeholder="https://example.com">${escapeHtml(defaults.urls)}</textarea>
        </div>
        <button type="submit" class="btn btn-primary">Queue Task</button>
      </form>
      <div id="task-result-market-research"></div>
    `;
  }

  if (task.type === "doc-sync" || task.type === "nightly-batch") {
    return `
      <form class="form-stack task-form" data-task-type="${escapeHtml(task.type)}">
        <button type="submit" class="btn btn-primary">Queue Admin Task</button>
      </form>
      <div id="task-result-${escapeHtml(task.type)}"></div>
    `;
  }

  return `<div class="status-note">This task is currently not exposed in V1 task runner.</div>`;
}

function taskResultContainer(taskType) {
  return document.getElementById(`task-result-${taskType}`);
}

function showTaskResult(taskType, message, isError = false) {
  const container = taskResultContainer(taskType);
  if (!container) return;
  container.innerHTML = `<div class="${isError ? "status-note" : "success-note"}">${escapeHtml(message)}</div>`;
}

function buildTaskPayload(taskType, formData) {
  if (taskType === "heartbeat") {
    return {
      reason: formData.get("reason") || "operator-ui",
    };
  }

  if (taskType === "build-refactor") {
    const maxFilesChanged = Number(formData.get("maxFilesChanged") || 10);
    return {
      type: String(formData.get("type") || "refactor"),
      scope: String(formData.get("scope") || "src"),
      constraints: {
        runTests: formData.get("runTests") === "on",
        maxFilesChanged: Number.isFinite(maxFilesChanged) ? maxFilesChanged : 10,
      },
    };
  }

  if (taskType === "market-research") {
    const mode = String(formData.get("mode") || "query");
    const query = String(formData.get("query") || "");
    const scope = String(formData.get("scope") || "general");
    if (mode === "url") {
      const rawUrls = String(formData.get("urls") || "");
      const urls = rawUrls
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
      return {
        query,
        scope,
        urls,
      };
    }
    return {
      query,
      scope,
    };
  }

  return {};
}

function bindTaskFormHandlers() {
  document.querySelectorAll(".task-form").forEach((formElement) => {
    const form = /** @type {HTMLFormElement} */ (formElement);
    const taskType = form.dataset.taskType;
    if (!taskType) return;

    const modeSelect = form.querySelector('select[name="mode"]');
    if (modeSelect) {
      const syncUrlGroup = () => {
        const group = form.querySelector(".url-mode-group");
        if (!group) return;
        group.classList.toggle("hidden", modeSelect.value !== "url");
      };
      modeSelect.addEventListener("change", syncUrlGroup);
      syncUrlGroup();
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      try {
        const payload = buildTaskPayload(taskType, formData);
        const response = await fetchProtected("/api/tasks/trigger", {
          method: "POST",
          body: JSON.stringify({
            type: taskType,
            payload,
          }),
        });
        state.lastTaskQueueResult = response;
        showTaskResult(
          taskType,
          `Queued ${response.type} as ${response.taskId} at ${formatDate(response.createdAt)}.`,
        );
        await Promise.all([loadOverviewData(), loadApprovals()]);
      } catch (error) {
        showTaskResult(taskType, error instanceof Error ? error.message : String(error), true);
      }
    });
  });
}

function renderApprovals() {
  const tableContainer = document.getElementById("approvals-table");
  const detailContainer = document.getElementById("approval-detail");

  const approvals = state.data.approvals?.pending ?? [];
  if (!approvals.length) {
    tableContainer.innerHTML = `<div class="status-note">No pending approvals.</div>`;
    detailContainer.innerHTML = `<div class="status-note">Select an approval item to review details.</div>`;
    return;
  }

  const selectedTaskId =
    state.selectedApprovalTaskId && approvals.some((item) => item.taskId === state.selectedApprovalTaskId)
      ? state.selectedApprovalTaskId
      : approvals[0].taskId;
  state.selectedApprovalTaskId = selectedTaskId;

  tableContainer.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Task</th>
          <th>Type</th>
          <th>Requested At</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${approvals
          .map((approval) => {
            const selected = approval.taskId === selectedTaskId;
            return `
              <tr class="click-row ${selected ? "selected" : ""}" data-approval-id="${escapeHtml(approval.taskId)}">
                <td>${escapeHtml(approval.taskId)}</td>
                <td>${escapeHtml(approval.type)}</td>
                <td>${escapeHtml(formatDate(approval.requestedAt))}</td>
                <td>${statusBadge("Pending", "warn")}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;

  tableContainer.querySelectorAll("tr[data-approval-id]").forEach((row) => {
    row.addEventListener("click", () => {
      const approvalId = row.getAttribute("data-approval-id");
      state.selectedApprovalTaskId = approvalId;
      renderApprovals();
    });
  });

  const selected = approvals.find((item) => item.taskId === selectedTaskId);
  if (!selected) {
    detailContainer.innerHTML = `<div class="status-note">Select an approval item to review details.</div>`;
    return;
  }

  detailContainer.innerHTML = `
    <div class="stack">
      <div class="status-note">
        <strong>Task:</strong> ${escapeHtml(selected.taskId)}<br />
        <strong>Type:</strong> ${escapeHtml(selected.type)}<br />
        <strong>Requested:</strong> ${escapeHtml(formatDate(selected.requestedAt))}
      </div>
      <pre>${escapeHtml(JSON.stringify(selected.payload ?? {}, null, 2))}</pre>
      <form id="approval-decision-form" class="form-stack">
        <label>Actor</label>
        <input name="actor" value="operator-ui" />
        <label>Decision Note</label>
        <textarea name="note" rows="4" placeholder="Add optional operator context"></textarea>
        <div class="row">
          <button type="submit" class="btn btn-primary" data-decision="approved">Approve</button>
          <button type="submit" class="btn" data-decision="rejected">Reject</button>
        </div>
      </form>
      <div id="approval-decision-result"></div>
    </div>
  `;

  const decisionForm = document.getElementById("approval-decision-form");
  decisionForm.querySelectorAll("button[data-decision]").forEach((button) => {
    button.addEventListener("click", () => {
      decisionForm.dataset.decision = button.getAttribute("data-decision");
    });
  });

  decisionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const resultContainer = document.getElementById("approval-decision-result");
    try {
      const formData = new FormData(decisionForm);
      const decision = decisionForm.dataset.decision || "approved";
      const actor = String(formData.get("actor") || "operator-ui").trim();
      const note = String(formData.get("note") || "").trim();
      const payload = { decision, actor };
      if (note) payload.note = note;

      const response = await fetchProtected(
        `/api/approvals/${encodeURIComponent(selected.taskId)}/decision`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

      const replayNote = response.replayTaskId
        ? ` Replay task queued: ${response.replayTaskId}.`
        : "";
      resultContainer.innerHTML = `<div class="success-note">Decision recorded (${decision}).${escapeHtml(replayNote)}</div>`;
      await Promise.all([loadApprovals(), loadOverviewData()]);
    } catch (error) {
      resultContainer.innerHTML = `<div class="status-note">${escapeHtml(
        error instanceof Error ? error.message : String(error),
      )}</div>`;
    }
  });
}

function renderAgents() {
  const agentsContainer = document.getElementById("agents-table");
  const payload = state.data.agentsOverview;
  if (!payload || !Array.isArray(payload.agents)) {
    agentsContainer.innerHTML = `<div class="status-note">Agent overview not loaded yet.</div>`;
    return;
  }

  if (!payload.agents.length) {
    agentsContainer.innerHTML = `<div class="status-note">No declared agents found.</div>`;
    return;
  }

  agentsContainer.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Agent</th>
          <th>Task</th>
          <th>Worker</th>
          <th>Service</th>
          <th>Memory</th>
          <th>Exposure</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${payload.agents
          .map((agent) => {
            const workerBadge =
              agent.workerValidationStatus === "confirmed-worker"
                ? statusBadge("Confirmed worker", "ok")
                : agent.workerValidationStatus === "partial-worker"
                  ? statusBadge("Partial worker", "warn")
                  : statusBadge("Not yet verified", "risk");
            const serviceAvailable =
              agent.serviceAvailable ?? agent.serviceImplementation;
            const serviceInstalled = agent.serviceInstalled;
            const serviceRunning = agent.serviceRunning === true;
            const serviceBadge = serviceRunning
              ? statusBadge("Service running", "ok")
              : serviceInstalled === true
                ? statusBadge("Service installed, stopped", "warn")
                : serviceAvailable
                  ? statusBadge("Service available, not installed", "warn")
                  : statusBadge("Service not available", "risk");
            const exposureBadge =
              agent.frontendExposure === "usable-now"
                ? statusBadge("Usable now", "ok")
                : agent.frontendExposure === "partial"
                  ? statusBadge("Partial", "warn")
                  : statusBadge("Backend only", "risk");
            const memoryLabel = agent.memory
              ? `${Number(agent.memory.totalRuns || 0)} runs, last: ${formatDate(agent.memory.lastRunAt)}`
              : "No memory state";
            const evidenceLabel = Array.isArray(agent.evidenceSources) && agent.evidenceSources.length
              ? `${agent.evidenceSources.join(", ")} · ${formatDate(agent.lastEvidenceAt)}`
              : "No worker evidence yet";
            return `
              <tr>
                <td>
                  <strong>${escapeHtml(agent.name || agent.id)}</strong><br />
                  <span class="muted">${escapeHtml(agent.id)}</span>
                </td>
                <td>${escapeHtml(agent.orchestratorTask || "n/a")}</td>
                <td>
                  ${agent.spawnedWorkerCapable ? statusBadge("Spawned-worker capable", "info") : statusBadge("No worker entrypoint", "risk")}
                  <div class="pillars">${workerBadge}</div>
                </td>
                <td>${serviceBadge}</td>
                <td>
                  ${escapeHtml(memoryLabel)}<br />
                  <span class="muted">Dependency sensitivity: ${escapeHtml(agent.dependencySensitivity)}</span><br />
                  <span class="muted">Evidence: ${escapeHtml(evidenceLabel)}</span>
                </td>
                <td>${exposureBadge}</td>
                <td>
                  <ul class="list">
                    ${(agent.notes || []).map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
                  </ul>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderGovernance() {
  const cards = document.getElementById("governance-cards");
  const overview = state.data.overview;
  if (!overview) {
    cards.innerHTML = `<div class="status-note">Governance summary not loaded yet.</div>`;
    return;
  }

  const governance = overview.governance ?? {};
  cards.innerHTML = `
    <article class="card">
      <h3>Approvals Pending</h3>
      <div class="metric">${Number(governance.approvals?.pendingCount ?? 0)}</div>
      <div class="submetric">Explicit approval gate backlog</div>
    </article>
    <article class="card">
      <h3>Retry Recovery Backlog</h3>
      <div class="metric">${Number(governance.taskRetryRecoveries?.count ?? 0)}</div>
      <div class="submetric">Next retry: ${formatDate(governance.taskRetryRecoveries?.nextRetryAt)}</div>
    </article>
    <article class="card">
      <h3>Milestone Delivery</h3>
      <div class="metric">${Number(governance.milestoneDeliveries?.pendingCount ?? 0)}</div>
      <div class="submetric">
        retrying ${Number(governance.milestoneDeliveries?.retryingCount ?? 0)},
        dead-letter ${Number(governance.milestoneDeliveries?.deadLetterCount ?? 0)}
      </div>
    </article>
    <article class="card">
      <h3>Demand Delivery</h3>
      <div class="metric">${Number(governance.demandSummaryDeliveries?.pendingCount ?? 0)}</div>
      <div class="submetric">
        retrying ${Number(governance.demandSummaryDeliveries?.retryingCount ?? 0)},
        dead-letter ${Number(governance.demandSummaryDeliveries?.deadLetterCount ?? 0)}
      </div>
    </article>
    <article class="card">
      <h3>Governed Skills</h3>
      <div class="metric">${Number(governance.governedSkills?.totalCount ?? 0)}</div>
      <div class="submetric">
        pending ${Number(governance.governedSkills?.pendingReviewCount ?? 0)},
        approved ${Number(governance.governedSkills?.approvedCount ?? 0)}
      </div>
    </article>
    <article class="card">
      <h3>Durability Split</h3>
      <div class="metric">${Number(governance.governedSkills?.restartSafeCount ?? 0)}</div>
      <div class="submetric">
        metadata-only ${Number(governance.governedSkills?.metadataOnlyCount ?? 0)}
      </div>
    </article>
  `;
}

function renderHealth() {
  const healthCards = document.getElementById("health-cards");
  const notes = document.getElementById("health-notes");
  const health = state.data.health;
  const extendedHealth = state.data.extendedHealth;
  const persistence = state.data.persistenceHealth;
  const overview = state.data.overview;

  if (!health || !extendedHealth || !persistence || !overview) {
    healthCards.innerHTML = `<div class="status-note">Health data not loaded yet.</div>`;
    notes.innerHTML = "";
    return;
  }

  healthCards.innerHTML = `
    <article class="card">
      <h3>Extended Health</h3>
      <div class="metric">${escapeHtml(extendedHealth.status ?? "unknown")}</div>
      <div class="submetric">routing=${escapeHtml(extendedHealth.controlPlane?.routing ?? "unknown")}</div>
    </article>
    <article class="card">
      <h3>Persistence</h3>
      <div class="metric">${escapeHtml(persistence.status ?? "unknown")}</div>
      <div class="submetric">database=${String(persistence.database ?? false)}, collections=${Number(persistence.collections ?? 0)}</div>
    </article>
    <article class="card">
      <h3>Liveness</h3>
      <div class="metric">${escapeHtml(health.status ?? "unknown")}</div>
      <div class="submetric">${escapeHtml(formatDate(health.timestamp))}</div>
    </article>
    <article class="card">
      <h3>Runtime Mode</h3>
      <div class="metric">${overview.health?.fastStartMode ? "Fast-start" : "Normal"}</div>
      <div class="submetric">Use fast-start only for controlled validation scenarios.</div>
    </article>
  `;

  const healthNotes = [];
  healthNotes.push(
    "Control-plane routing success is separate from downstream dependency success.",
  );
  if ((extendedHealth.status || "").toLowerCase() !== "healthy") {
    healthNotes.push(
      "Authoritative health is sourced from /api/health/extended, not /health or dashboard aggregation.",
    );
  }
  if (overview.health?.fastStartMode) {
    healthNotes.push(
      "Fast-start mode may keep APIs routable while persistence/indexing/knowledge integrations are intentionally reduced.",
    );
  }
  if (String(persistence.status || "").toLowerCase() !== "healthy") {
    healthNotes.push(
      "Persistence is degraded. Tasks may still queue, but durability/observability guarantees are reduced.",
    );
  }
  notes.innerHTML = healthNotes.map((note) => `<div class="status-note">${escapeHtml(note)}</div>`).join("");
}

function renderActivity() {
  const tasksEl = document.getElementById("activity-tasks");
  const memoryEl = document.getElementById("activity-memory");
  const recentTasks = state.data.overview?.recentTasks ?? [];
  const memory = state.data.memoryRecall;

  if (!recentTasks.length) {
    tasksEl.innerHTML = `<div class="status-note">No recent tasks recorded.</div>`;
  } else {
    tasksEl.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Handled At</th>
            <th>Type</th>
            <th>Result</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          ${[...recentTasks]
            .reverse()
            .map(
              (task) => `
            <tr>
              <td>${escapeHtml(formatDate(task.handledAt))}</td>
              <td>${escapeHtml(task.type || "unknown")}</td>
              <td>${statusBadge(task.result === "ok" ? "Success" : "Failed", task.result === "ok" ? "ok" : "risk")}</td>
              <td>${escapeHtml(task.message || "")}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  if (!memory || !Array.isArray(memory.items)) {
    memoryEl.innerHTML = `<div class="status-note">Agent memory recall not loaded yet.</div>`;
    return;
  }

  if (!memory.items.length) {
    memoryEl.innerHTML = `<div class="status-note">No agent memory entries returned.</div>`;
    return;
  }

  memoryEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Agent</th>
          <th>Last Run</th>
          <th>Status</th>
          <th>Total Runs</th>
          <th>Success/Error</th>
        </tr>
      </thead>
      <tbody>
        ${memory.items
          .map(
            (item) => `
          <tr>
            <td>${escapeHtml(item.agentId || "unknown")}</td>
            <td>${escapeHtml(formatDate(item.lastRunAt))}</td>
            <td>${statusBadge(
              item.lastStatus || "unknown",
              item.lastStatus === "error" ? "risk" : "info",
            )}</td>
            <td>${Number(item.totalRuns || 0)}</td>
            <td>${Number(item.successCount || 0)} / ${Number(item.errorCount || 0)}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderKnowledgeSummary() {
  const container = document.getElementById("knowledge-summary");
  const summary = state.data.knowledgeSummary;
  if (!summary) {
    container.innerHTML = `<div class="status-note">Knowledge summary not loaded yet.</div>`;
    return;
  }

  container.innerHTML = `<pre>${escapeHtml(JSON.stringify(summary, null, 2))}</pre>`;
}

async function runKnowledgeQuery(query) {
  const result = await fetchProtected("/api/knowledge/query", {
    method: "POST",
    body: JSON.stringify({ query }),
  });
  state.data.knowledgeQueryResult = result;
  const resultContainer = document.getElementById("knowledge-query-result");
  resultContainer.innerHTML = `<pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>`;
}

function bindStaticEvents() {
  document.getElementById("nav-stack").addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("nav-item")) return;
    selectTab(target.dataset.tab);
  });

  document.getElementById("save-token-btn").addEventListener("click", () => {
    const tokenInput = document.getElementById("token-input");
    state.token = tokenInput.value.trim();
    localStorage.setItem(storageKeys.token, state.token);
    setAlert("Bearer token saved for this browser session.", "ok");
  });

  document.getElementById("show-admin-tasks-toggle").addEventListener("change", (event) => {
    const checked = Boolean(event.target.checked);
    state.showAdminTasks = checked;
    localStorage.setItem(storageKeys.showAdminTasks, String(checked));
    renderTasks();
  });

  document.getElementById("refresh-all-btn").addEventListener("click", () => {
    void refreshAll();
  });

  document
    .getElementById("knowledge-query-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = document.getElementById("knowledge-query-input");
      const query = input.value.trim();
      if (!query) {
        setAlert("Knowledge query cannot be empty.");
        return;
      }
      try {
        await runKnowledgeQuery(query);
      } catch (error) {
        setAlert(error instanceof Error ? error.message : String(error));
      }
    });
}

async function refreshAll() {
  if (!state.token) {
    setAlert("Set bearer token before loading protected operator routes.");
    return;
  }

  await Promise.all([
    loadOverviewData(),
    loadTasksCatalog(),
    loadApprovals(),
    loadAgentsOverview(),
    loadActivityData(),
    loadKnowledgeSummary(),
  ]);
}

function boot() {
  applyTokenUI();
  bindStaticEvents();
  renderOverview();
  renderTasks();
  renderApprovals();
  renderAgents();
  renderGovernance();
  renderHealth();
  renderActivity();
  renderKnowledgeSummary();

  if (state.token) {
    void refreshAll();
  } else {
    setAlert("Set bearer token to unlock protected operator routes.");
  }
}

boot();
