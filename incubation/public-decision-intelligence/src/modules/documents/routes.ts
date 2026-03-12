import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { DomainError } from "../../common/errors.js";
import { ingestDocument, ingestRequestSchema } from "../../lib/ingest-service.js";

export const documentRoutes: FastifyPluginAsync = async (app) => {
  app.post("/documents/ingest", async (request, reply) => {
    const result = await ingestDocument(request.body as z.infer<typeof ingestRequestSchema>, {
      env: app.runtimeContext.env,
      ledger: app.runtimeContext.ledger
    });
    reply.status(result.deduplicated ? 200 : 201).send({
      deduplicated: result.deduplicated,
      document: result.document,
      ingest: result.ingest,
      chunkCount: result.chunks.length,
      citationCount: result.citations.length,
      entityCount: result.entities.length,
      eventCount: result.events.length,
      claimCount: result.claims.length,
      relationshipCount: result.relationships.length,
      decisionChainCount: result.decisionChains.length
    });
  });

  app.get("/documents", async () => {
    const ledger = await app.runtimeContext.ledger.read();
    const items = [...ledger.documents].sort((a, b) => b.ingestedAt.localeCompare(a.ingestedAt));
    return {
      items,
      count: items.length,
      intent: "List ingested source documents with lineage, parse status, and source metadata."
    };
  });

  app.get("/documents/:documentId", async (request) => {
    const ledger = await app.runtimeContext.ledger.read();
    const documentId = (request.params as { documentId: string }).documentId;
    const document = ledger.documents.find((entry) => entry.documentId === documentId);

    if (!document) {
      throw new DomainError("DOCUMENT_NOT_FOUND", `No document found for ${documentId}`, 404);
    }

    const lineage = ledger.documents
      .filter((entry) => entry.versionGroupId === document!.versionGroupId)
      .sort((a, b) => a.ingestedAt.localeCompare(b.ingestedAt));

    return {
      document,
      chunks: ledger.chunks.filter((chunk) => chunk.documentId === documentId),
      citations: ledger.citations.filter((citation) => citation.documentId === documentId),
      entities: ledger.entities.filter((entity) => entity.documentIds.includes(documentId)),
      mentions: ledger.mentions.filter((mention) => mention.documentId === documentId),
      events: ledger.events.filter((event) => event.documentId === documentId),
      claims: ledger.claims.filter((claim) => claim.documentId === documentId),
      relationships: ledger.relationships.filter((relationship) => relationship.documentId === documentId),
      decisionChains: ledger.decisionChains.filter((chain) => chain.documentIds.includes(documentId)),
      lineage,
      intent: "Return one document with chunks, citations, and ingest lineage."
    };
  });
};
