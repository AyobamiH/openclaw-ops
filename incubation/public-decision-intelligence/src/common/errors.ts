import { ZodError } from "zod";
import type { FastifyInstance } from "fastify";

export class DomainError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function registerErrorHandling(app: FastifyInstance<any, any, any, any, any>) {
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error instanceof DomainError ? error.statusCode : error instanceof ZodError ? 400 : 500;
    const code =
      error instanceof DomainError
        ? error.code
        : error instanceof ZodError
          ? "INVALID_REQUEST"
          : "INTERNAL_ERROR";

    request.log.error({ err: error, code }, "request failed");
    const message = error instanceof Error ? error.message : "Unknown error";
    reply.status(statusCode).send({
      error: {
        code,
        message
      }
    });
  });
}
