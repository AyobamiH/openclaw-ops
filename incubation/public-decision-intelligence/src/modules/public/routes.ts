import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { DomainError } from "../../common/errors.js";
import { searchLedger } from "../../lib/search.js";
import { buildEntityProjection } from "../../lib/phase2-projections.js";
import { buildDecisionChainProjection, decisionChainVisibilitySummary } from "../../lib/decision-chain-projections.js";

const publicSearchSchema = z.object({
  query: z.string().trim().min(1).optional(),
  sourceCollection: z.string().optional(),
  entityType: z.string().optional(),
  eventType: z.string().optional(),
  predicate: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
});

export const publicRoutes: FastifyPluginAsync = async (app) => {
  if (!app.runtimeContext.env.PUBLIC_API_ENABLED) {
    return;
  }

  app.get("/browse", async (_request, reply) => {
    reply.type("text/html").send(renderBrowseHtml());
  });

  app.get("/browse/app.js", async (_request, reply) => {
    reply.type("application/javascript").send(renderBrowseScript());
  });

  app.get("/browse/styles.css", async (_request, reply) => {
    reply.type("text/css").send(renderBrowseStyles());
  });

  app.get("/public/api/overview", async () => {
    const ledger = await app.runtimeContext.ledger.read();
    const chainView = decisionChainVisibilitySummary(ledger);
    return {
      service: "public-decision-intelligence",
      previewMode: chainView.previewMode,
      counts: {
        documents: ledger.documents.length,
        entities: ledger.entities.length,
        decisionChains: chainView.visibleChains.length,
        publishedDecisionChains: ledger.decisionChains.filter((chain) => chain.status === "published").length,
        claims: ledger.claims.filter((claim) => claim.lifecycleState === "published").length,
        relationships: ledger.relationships.filter((relationship) => relationship.lifecycleState === "published").length
      },
      featuredChains: chainView.visibleChains.slice(0, 5).map((chain) => ({
        decisionChainId: chain.decisionChainId,
        subject: chain.subject,
        confidence: chain.confidence,
        status: chain.status,
        publicationStatus: chain.status === "published" ? "published" : "preview",
        verificationState: chain.verificationState,
        sourceCollection: chain.sourceCollection,
        summary: chain.summary,
        stageCount: chain.stages.filter((stage) => stage.eventIds.length > 0 || stage.relationshipIds.length > 0).length,
        lastUpdated: chain.publishedAt ?? chain.reviewedAt ?? chain.assembledAt,
        gapCount: chain.gaps.length
      })),
      latestDocuments: [...ledger.documents]
        .sort((a, b) => b.ingestedAt.localeCompare(a.ingestedAt))
        .slice(0, 8)
    };
  });

  app.get("/public/api/documents", async () => {
    const ledger = await app.runtimeContext.ledger.read();
    const items = [...ledger.documents]
      .sort((a, b) => b.ingestedAt.localeCompare(a.ingestedAt))
      .map((document) => ({
        document,
        chainCount: ledger.decisionChains.filter((chain) => chain.documentIds.includes(document.documentId)).length,
        entityCount: ledger.entities.filter((entity) => entity.documentIds.includes(document.documentId)).length
      }));
    return { items, count: items.length };
  });

  app.get("/public/api/documents/:documentId", async (request) => {
    const ledger = await app.runtimeContext.ledger.read();
    const documentId = (request.params as { documentId: string }).documentId;
    const document = ledger.documents.find((entry) => entry.documentId === documentId);
    if (!document) {
      throw new DomainError("DOCUMENT_NOT_FOUND", `No document found for ${documentId}`, 404);
    }
    const chainView = decisionChainVisibilitySummary(ledger);
    return {
      document,
      chunks: ledger.chunks.filter((chunk) => chunk.documentId === documentId),
      citations: ledger.citations.filter((citation) => citation.documentId === documentId),
      entities: ledger.entities
        .filter((entity) => entity.documentIds.includes(documentId))
        .map((entity) => buildEntityProjection(ledger, entity)),
      decisionChains: chainView.visibleChains
        .filter((chain) => chain.documentIds.includes(documentId))
        .map((chain) => ({
          decisionChainId: chain.decisionChainId,
          subject: chain.subject,
          status: chain.status,
          verificationState: chain.verificationState,
          confidence: chain.confidence,
          summary: chain.summary
        }))
    };
  });

  app.get("/public/api/entities", async () => {
    const ledger = await app.runtimeContext.ledger.read();
    const chainView = decisionChainVisibilitySummary(ledger);
    const items = [...ledger.entities]
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .map((entity) => ({
        ...buildEntityProjection(ledger, entity),
        linkedChainCount: chainView.visibleChains.filter((chain) => chain.subjectEntityIds.includes(entity.entityId)).length
      }));
    return { items, count: items.length };
  });

  app.get("/public/api/entities/:entityId", async (request) => {
    const ledger = await app.runtimeContext.ledger.read();
    const entityId = (request.params as { entityId: string }).entityId;
    const entity = ledger.entities.find((entry) => entry.entityId === entityId);
    if (!entity) {
      throw new DomainError("ENTITY_NOT_FOUND", `No entity found for ${entityId}`, 404);
    }
    const chainView = decisionChainVisibilitySummary(ledger);
    return {
      ...buildEntityProjection(ledger, entity),
      decisionChains: chainView.visibleChains.filter((chain) => chain.subjectEntityIds.includes(entityId))
    };
  });

  app.get("/public/api/decision-chains", async () => {
    const ledger = await app.runtimeContext.ledger.read();
    const chainView = decisionChainVisibilitySummary(ledger);
    return {
      previewMode: chainView.previewMode,
      items: chainView.visibleChains.map((chain) => ({
        decisionChainId: chain.decisionChainId,
        subject: chain.subject,
        sourceCollection: chain.sourceCollection,
        confidence: chain.confidence,
        status: chain.status,
        publicationStatus: chain.status === "published" ? "published" : "preview",
        verificationState: chain.verificationState,
        summary: chain.summary,
        stageCount: chain.stages.filter((stage) => stage.eventIds.length > 0 || stage.relationshipIds.length > 0).length,
        lastUpdated: chain.publishedAt ?? chain.reviewedAt ?? chain.assembledAt,
        gapCount: chain.gaps.length
      })),
      count: chainView.visibleChains.length
    };
  });

  app.get("/public/api/decision-chains/:decisionChainId", async (request) => {
    const ledger = await app.runtimeContext.ledger.read();
    const chainId = (request.params as { decisionChainId: string }).decisionChainId;
    const chainView = decisionChainVisibilitySummary(ledger);
    const chain = chainView.visibleChains.find((entry) => entry.decisionChainId === chainId);
    if (!chain) {
      throw new DomainError("DECISION_CHAIN_NOT_FOUND", `No visible decision chain found for ${chainId}`, 404);
    }
    return {
      previewMode: chainView.previewMode,
      ...buildDecisionChainProjection(ledger, chain)
    };
  });

  app.post("/public/api/search", async (request) => {
    const ledger = await app.runtimeContext.ledger.read();
    const body = publicSearchSchema.parse(request.body ?? {});
    const result = searchLedger(ledger, body);
    const chainView = decisionChainVisibilitySummary(ledger);
    const matchingChains = chainView.visibleChains.filter((chain) => {
      if (body.sourceCollection && chain.sourceCollection !== body.sourceCollection) {
        return false;
      }
      if (!body.query) {
        return true;
      }
      const query = body.query.toLowerCase();
      return [chain.subject, chain.summary, chain.sourceCollection].some((value) => value.toLowerCase().includes(query));
    });
    return {
      ...result,
      previewMode: chainView.previewMode,
      groups: {
        ...result.groups,
        decisionChains: matchingChains.map((chain) => ({
          decisionChainId: chain.decisionChainId,
          subject: chain.subject,
          summary: chain.summary,
          status: chain.status,
          verificationState: chain.verificationState,
          confidence: chain.confidence
        }))
      },
      totals: {
        ...result.totals,
        decisionChains: matchingChains.length
      }
    };
  });
};

function renderBrowseHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Public Decision Intelligence</title>
    <link rel="stylesheet" href="/browse/styles.css" />
  </head>
  <body>
    <div class="shell">
      <header class="hero">
        <p class="eyebrow">Public Decision Intelligence</p>
        <h1>Browse evidence, entities, and decision chains</h1>
        <p class="lede">A public reader for structured decision intelligence. Evidence stays linked to source context, review state, and chain stage.</p>
      </header>

      <section class="overview-grid" id="overview-cards"></section>

      <section class="panel">
        <div class="panel-header">
          <h2>Search</h2>
          <p>Search documents, entities, events, claims, relationships, and visible decision chains.</p>
        </div>
        <form id="search-form" class="search-form">
          <input type="search" name="query" placeholder="Search names, events, or phrases" />
          <input type="text" name="sourceCollection" placeholder="Source collection (optional)" />
          <button type="submit">Search</button>
        </form>
        <div id="search-results" class="search-results"></div>
      </section>

      <div class="grid">
        <section class="panel">
          <div class="panel-header">
            <h2>Decision Chains</h2>
            <p id="chain-mode"></p>
          </div>
          <div id="chain-list" class="stack"></div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <h2>Documents</h2>
            <p>Latest ingested evidence sources.</p>
          </div>
          <div id="document-list" class="stack"></div>
        </section>
      </div>

      <div class="grid">
        <section class="panel">
          <div class="panel-header">
            <h2>Entities</h2>
            <p>Canonical people and organisations with evidence density.</p>
          </div>
          <div id="entity-list" class="stack"></div>
        </section>

        <section class="panel detail-panel">
          <div class="panel-header">
            <h2>Detail</h2>
            <p id="detail-label">Select a chain, document, or entity.</p>
          </div>
          <div id="detail-view" class="detail-view"></div>
        </section>
      </div>
    </div>
    <script type="module" src="/browse/app.js"></script>
  </body>
</html>`;
}

function renderBrowseStyles() {
  return `:root {
  color-scheme: dark;
  --bg: #0a0b10;
  --panel: #12151c;
  --panel-border: rgba(255,255,255,0.12);
  --text: #eef3fb;
  --muted: #98a4b8;
  --accent: #d4aa6b;
  --accent-soft: rgba(212,170,107,0.16);
  --danger: #f06464;
  --ok: #7bd88f;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Inter", system-ui, sans-serif;
  background:
    radial-gradient(circle at top, rgba(212,170,107,0.12), transparent 28%),
    linear-gradient(180deg, #07080c 0%, #0c1017 100%);
  color: var(--text);
}
.shell { max-width: 1240px; margin: 0 auto; padding: 32px 20px 56px; }
.hero { margin-bottom: 24px; }
.eyebrow { color: var(--accent); text-transform: uppercase; letter-spacing: 0.16em; font-size: 0.76rem; margin: 0 0 8px; }
h1, h2, h3, p { margin: 0; }
h1 { font-size: clamp(2rem, 4vw, 3rem); line-height: 1.05; margin-bottom: 12px; }
.lede { color: var(--muted); max-width: 76ch; }
.overview-grid, .grid { display: grid; gap: 16px; }
.overview-grid { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-bottom: 16px; }
.grid { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); margin-top: 16px; align-items: start; }
.panel, .card, .item {
  background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  box-shadow: 0 18px 40px rgba(0,0,0,0.28);
}
.panel { padding: 18px; }
.panel-header { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; }
.panel-header p { color: var(--muted); font-size: 0.92rem; }
.card { padding: 16px; }
.card strong { display: block; font-size: 1.8rem; margin-top: 8px; }
.stack { display: flex; flex-direction: column; gap: 12px; }
.item { padding: 14px; cursor: pointer; transition: border-color 120ms ease, transform 120ms ease; }
.item:hover { border-color: rgba(212,170,107,0.45); transform: translateY(-1px); }
.item-title { font-weight: 700; margin-bottom: 6px; }
.item-meta, .detail-meta, .stage-meta { color: var(--muted); font-size: 0.9rem; display: flex; flex-wrap: wrap; gap: 10px; }
.pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 4px 10px; font-size: 0.8rem; background: rgba(255,255,255,0.06); color: var(--text); }
.pill.preview { background: var(--accent-soft); color: #f5d39f; }
.pill.ok { background: rgba(123,216,143,0.16); color: var(--ok); }
.pill.warn { background: rgba(240,100,100,0.16); color: #ffb2b2; }
.detail-view { min-height: 240px; display: flex; flex-direction: column; gap: 16px; }
.detail-block { border-top: 1px solid rgba(255,255,255,0.08); padding-top: 14px; }
.detail-block:first-child { border-top: 0; padding-top: 0; }
.detail-block ul { margin: 10px 0 0; padding-left: 18px; color: var(--muted); }
.search-form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 320px) auto; gap: 10px; margin-bottom: 14px; }
.search-form input, .search-form button {
  border-radius: 12px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: var(--text); padding: 12px 14px; font: inherit;
}
.search-form button { background: linear-gradient(180deg, rgba(212,170,107,0.3), rgba(212,170,107,0.18)); border-color: rgba(212,170,107,0.45); cursor: pointer; }
.search-results { color: var(--muted); }
.result-group { margin-top: 14px; }
.result-group h3 { margin-bottom: 8px; font-size: 1rem; }
.result-group ul { margin: 0; padding-left: 18px; }
.stages { display: flex; flex-direction: column; gap: 10px; }
.stage { padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); }
.empty { color: var(--muted); }
@media (max-width: 860px) {
  .search-form { grid-template-columns: 1fr; }
}`;
}

function renderBrowseScript() {
  return `const state = {
  chains: [],
  documents: [],
  entities: [],
  overview: null
};

const refs = {
  overviewCards: document.getElementById("overview-cards"),
  chainMode: document.getElementById("chain-mode"),
  chainList: document.getElementById("chain-list"),
  documentList: document.getElementById("document-list"),
  entityList: document.getElementById("entity-list"),
  detailView: document.getElementById("detail-view"),
  detailLabel: document.getElementById("detail-label"),
  searchForm: document.getElementById("search-form"),
  searchResults: document.getElementById("search-results")
};

boot().catch((error) => {
  refs.detailLabel.textContent = "Failed to load public reader";
  refs.detailView.innerHTML = '<p class="empty">' + escapeHtml(String(error)) + '</p>';
});

async function boot() {
  const [overview, chains, documents, entities] = await Promise.all([
    fetchJson("/public/api/overview"),
    fetchJson("/public/api/decision-chains"),
    fetchJson("/public/api/documents"),
    fetchJson("/public/api/entities")
  ]);

  state.overview = overview;
  state.chains = chains.items;
  state.documents = documents.items;
  state.entities = entities.items;

  renderOverview(overview);
  renderChains(chains);
  renderDocuments(documents.items);
  renderEntities(entities.items);
  renderWelcome(overview);

  refs.searchForm.addEventListener("submit", onSearch);
}

function renderOverview(overview) {
  const cards = [
    ["Documents", overview.counts.documents],
    ["Entities", overview.counts.entities],
    ["Visible chains", overview.counts.decisionChains],
    ["Published chains", overview.counts.publishedDecisionChains]
  ];
  refs.overviewCards.innerHTML = cards.map(([label, value]) => '<article class="card"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(String(value)) + '</strong></article>').join("");
}

function renderChains(payload) {
  refs.chainMode.innerHTML = payload.previewMode
    ? '<span class="pill preview">Preview mode</span> No published chains yet. Showing the strongest under-review chains so the corpus is still browsable.'
    : '<span class="pill ok">Published</span> Showing published decision chains.';

  refs.chainList.innerHTML = payload.items.length
    ? payload.items.map((item) => '<article class="item" data-kind="chain" data-id="' + escapeHtml(item.decisionChainId) + '"><div class="item-title">' + escapeHtml(item.subject) + '</div><div class="item-meta"><span>' + escapeHtml(item.sourceCollection) + '</span><span>confidence ' + escapeHtml(String(item.confidence)) + '</span><span>' + escapeHtml(item.gapCount + ' gaps') + '</span></div><p>' + escapeHtml(item.summary) + '</p></article>').join("")
    : '<p class="empty">No decision chains are visible yet.</p>';

  refs.chainList.querySelectorAll("[data-kind='chain']").forEach((node) => {
    node.addEventListener("click", () => loadChain(node.dataset.id));
  });
}

function renderDocuments(items) {
  refs.documentList.innerHTML = items.map((entry) => '<article class="item" data-kind="document" data-id="' + escapeHtml(entry.document.documentId) + '"><div class="item-title">' + escapeHtml(entry.document.title) + '</div><div class="item-meta"><span>' + escapeHtml(entry.document.sourceCollection) + '</span><span>' + escapeHtml(entry.document.sourceType) + '</span><span>' + escapeHtml(entry.chainCount + ' chains') + '</span></div></article>').join("");
  refs.documentList.querySelectorAll("[data-kind='document']").forEach((node) => {
    node.addEventListener("click", () => loadDocument(node.dataset.id));
  });
}

function renderEntities(items) {
  refs.entityList.innerHTML = items.slice(0, 24).map((entry) => '<article class="item" data-kind="entity" data-id="' + escapeHtml(entry.entity.entityId) + '"><div class="item-title">' + escapeHtml(entry.entity.displayName) + '</div><div class="item-meta"><span>' + escapeHtml(entry.entity.entityType) + '</span><span>' + escapeHtml(entry.mentionCount + ' mentions') + '</span><span>' + escapeHtml(entry.documentCount + ' docs') + '</span></div></article>').join("");
  refs.entityList.querySelectorAll("[data-kind='entity']").forEach((node) => {
    node.addEventListener("click", () => loadEntity(node.dataset.id));
  });
}

function renderWelcome(overview) {
  refs.detailLabel.textContent = "Corpus overview";
  refs.detailView.innerHTML = '<div class="detail-block"><p>' + escapeHtml(overview.previewMode ? "Published chains are not available yet. The corpus is still browseable through documents, entities, and preview chains." : "Published chains are available alongside the raw document library.") + '</p></div>' +
    '<div class="detail-block"><h3>Featured chains</h3><ul>' + overview.featuredChains.map((chain) => '<li>' + escapeHtml(chain.subject + " — " + chain.summary) + '</li>').join("") + '</ul></div>';
}

async function loadChain(id) {
  const detail = await fetchJson('/public/api/decision-chains/' + encodeURIComponent(id));
  refs.detailLabel.textContent = detail.chain.subject;
  refs.detailView.innerHTML = '<div class="detail-block"><div class="detail-meta"><span>' + escapeHtml(detail.chain.sourceCollection) + '</span><span>' + escapeHtml(detail.chain.status) + '</span><span>' + escapeHtml(detail.chain.verificationState) + '</span><span>revision ' + escapeHtml(String(detail.chain.revision)) + '</span></div><p>' + escapeHtml(detail.chain.summary) + '</p></div>' +
    '<div class="detail-block"><h3>Stages</h3><div class="stages">' + detail.chain.stages.map((stage) => '<div class="stage"><strong>' + escapeHtml(stage.label) + '</strong><div class="stage-meta"><span>' + escapeHtml(stage.eventIds.length + ' events') + '</span><span>' + escapeHtml(stage.relationshipIds.length + ' relationships') + '</span><span>' + escapeHtml(stage.claimIds.length + ' claims') + '</span></div><p>' + escapeHtml(stage.summary) + '</p></div>').join('') + '</div></div>' +
    '<div class="detail-block"><h3>Gaps</h3>' + (detail.chain.gaps.length ? '<ul>' + detail.chain.gaps.map((gap) => '<li>' + escapeHtml(gap.label + ': ' + gap.description) + '</li>').join('') + '</ul>' : '<p class="empty">No unresolved gaps.</p>') + '</div>' +
    '<div class="detail-block"><h3>Alternatives</h3>' + (detail.chain.alternatives.length ? '<ul>' + detail.chain.alternatives.map((alternative) => '<li>' + escapeHtml(alternative.summary + ' — ' + alternative.rationale) + '</li>').join('') + '</ul>' : '<p class="empty">No alternative interpretations recorded.</p>') + '</div>';
}

async function loadDocument(id) {
  const detail = await fetchJson('/public/api/documents/' + encodeURIComponent(id));
  refs.detailLabel.textContent = detail.document.title;
  refs.detailView.innerHTML = '<div class="detail-block"><div class="detail-meta"><span>' + escapeHtml(detail.document.sourceCollection) + '</span><span>' + escapeHtml(detail.document.sourceType) + '</span><span>' + escapeHtml(detail.document.parseStatus) + '</span></div></div>' +
    '<div class="detail-block"><h3>Chunks</h3><ul>' + detail.chunks.map((chunk) => '<li>' + escapeHtml(chunk.excerpt) + '</li>').join('') + '</ul></div>' +
    '<div class="detail-block"><h3>Related chains</h3>' + (detail.decisionChains.length ? '<ul>' + detail.decisionChains.map((chain) => '<li>' + escapeHtml(chain.subject + ' — ' + chain.summary) + '</li>').join('') + '</ul>' : '<p class="empty">No visible chains linked to this document yet.</p>') + '</div>';
}

async function loadEntity(id) {
  const detail = await fetchJson('/public/api/entities/' + encodeURIComponent(id));
  refs.detailLabel.textContent = detail.entity.displayName;
  refs.detailView.innerHTML = '<div class="detail-block"><div class="detail-meta"><span>' + escapeHtml(detail.entity.entityType) + '</span><span>' + escapeHtml(detail.mentionCount + ' mentions') + '</span><span>' + escapeHtml(detail.documentCount + ' docs') + '</span></div></div>' +
    '<div class="detail-block"><h3>Decision chains</h3>' + (detail.decisionChains.length ? '<ul>' + detail.decisionChains.map((chain) => '<li>' + escapeHtml(chain.subject + ' — ' + chain.summary) + '</li>').join('') + '</ul>' : '<p class="empty">No visible chains tied to this entity yet.</p>') + '</div>';
}

async function onSearch(event) {
  event.preventDefault();
  const form = new FormData(refs.searchForm);
  const payload = Object.fromEntries([...form.entries()].filter(([, value]) => String(value).trim().length > 0));
  const result = await fetchJson('/public/api/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  refs.searchResults.innerHTML = ['documents', 'entities', 'events', 'claims', 'relationships', 'decisionChains']
    .map((group) => '<div class="result-group"><h3>' + escapeHtml(group) + ' (' + escapeHtml(String(result.totals[group] ?? 0)) + ')</h3>' + renderResultGroup(result.groups[group] ?? []) + '</div>')
    .join('');
}

function renderResultGroup(items) {
  if (!items.length) {
    return '<p class="empty">No matches.</p>';
  }
  return '<ul>' + items.slice(0, 5).map((item) => '<li>' + escapeHtml(item.document?.title ?? item.entity?.displayName ?? item.event?.summary ?? item.claim?.claimText ?? item.relationship?.summary ?? item.subject ?? item.summary ?? JSON.stringify(item)) + '</li>').join('') + '</ul>';
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(response.status + ' ' + response.statusText);
  }
  return response.json();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}`;
}
