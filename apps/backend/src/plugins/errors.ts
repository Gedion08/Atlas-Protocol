import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export interface ApiErrorBody {
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: "not_found",
      message: `Route ${request.method} ${request.url} not found`,
      statusCode: 404,
    } satisfies ApiErrorBody);
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ApiError) {
      reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
        statusCode: error.statusCode,
        details: error.details,
      } satisfies ApiErrorBody);
      return;
    }

    if (error instanceof ZodError) {
      const body: ApiErrorBody = {
        error: "validation_error",
        message: "Request validation failed",
        statusCode: 400,
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      };
      reply.status(400).send(body);
      return;
    }

    if (error.validation) {
      reply.status(400).send({
        error: "validation_error",
        message: error.message,
        statusCode: 400,
      } satisfies ApiErrorBody);
      return;
    }

    request.log.error({ err: error }, "unhandled error");
    reply.status(500).send({
      error: "internal_error",
      message: "An internal error occurred",
      statusCode: 500,
    } satisfies ApiErrorBody);
  });
}

export function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): FastifyReply {
  return reply.status(statusCode).send({ error: code, message, statusCode, details });
}
