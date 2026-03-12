import type { FastifyPluginAsync } from "fastify";

export const eventRoutes: FastifyPluginAsync = async (app) => {
  app.get("/events", async () => ({
    items: [],
    intent: "List extracted events by type, date, and review state."
  }));

  app.get("/events/:eventId", async (request) => ({
    eventId: (request.params as { eventId: string }).eventId,
    intent: "Return one event with participants, supporting claims, and citations."
  }));
};
