import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    const ledger = await app.runtimeContext.ledger.read();
    return {
      status: "healthy",
      service: "public-decision-intelligence",
      mode: "phase-4",
      storage: {
        ledgerDriver: "filesystem",
        objectStorageDriver: app.runtimeContext.objectStorage.driver
      },
      counts: {
        documents: ledger.documents.length,
        chunks: ledger.chunks.length,
        citations: ledger.citations.length,
        ingests: ledger.ingests.length,
        entities: ledger.entities.length,
        mentions: ledger.mentions.length,
        events: ledger.events.length,
        claims: ledger.claims.length,
        relationships: ledger.relationships.length,
        decisionChains: ledger.decisionChains.length,
        reviews: ledger.reviews.length
      }
    };
  });
};
