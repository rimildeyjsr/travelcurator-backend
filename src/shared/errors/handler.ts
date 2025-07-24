import { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { AppError, ApiError } from './types.js';

export function registerErrorHandler(fastify: FastifyInstance): void {
  console.log('🔧 Registering error handlers...');

  // Global error handler
  fastify.setErrorHandler(async (error: FastifyError | AppError, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.id;
    const path = request.url;
    const method = request.method;
    const timestamp = new Date().toISOString();

    console.log(`🚨 Error caught: ${error.message} (${method} ${path})`);

    // Log error for debugging (always log full error in development)
    if (config.server.nodeEnv === 'development') {
      fastify.log.error({
        requestId,
        method,
        path,
        error: error.message,
        stack: error.stack,
      }, 'Request Error');
    } else {
      // In production, only log operational errors with full details
      if (error instanceof AppError && error.isOperational) {
        fastify.log.warn({
          requestId,
          method,
          path,
          code: error.code,
          message: error.message,
        }, 'Operational Error');
      } else {
        // Log non-operational errors (bugs) with full details for debugging
        fastify.log.error({
          requestId,
          method,
          path,
          error: error.message,
          stack: error.stack,
        }, 'System Error');
      }
    }

    // Handle different error types
    if (error instanceof AppError) {
      const apiError: ApiError = {
        code: error.statusCode,
        error: getErrorName(error.statusCode),
        message: error.message,
        timestamp,
        path,
        requestId,
      };

      return reply.status(error.statusCode).send(apiError);
    }

    // Handle Fastify validation errors
    if (error.validation) {
      const validationError = {
        code: 400,
        error: 'Validation Error',
        message: 'Request validation failed',
        timestamp,
        path,
        requestId,
        details: error.validation.map(err => ({
          field: err.instancePath || err.schemaPath || 'unknown',
          message: err.message || 'Invalid value',
          value: (err as any).data || undefined, // Cast to any to access data property
        })),
      };

      return reply.status(400).send(validationError);
    }

    // Handle rate limit errors
    if (error.statusCode === 429) {
      const rateLimitError: ApiError = {
        code: 429,
        error: 'Too Many Requests',
        message: error.message || 'Rate limit exceeded',
        timestamp,
        path,
        requestId,
      };

      return reply.status(429).send(rateLimitError);
    }

    // Default error response (don't expose internal details)
    const internalError: ApiError = {
      code: 500,
      error: 'Internal Server Error',
      message: config.server.nodeEnv === 'development'
        ? error.message
        : 'An unexpected error occurred',
      timestamp,
      path,
      requestId,
    };

    return reply.status(500).send(internalError);
  });

  // Handle 404 errors (route not found)
  fastify.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    console.log(`🚨 404 Error: ${request.method} ${request.url}`);

    const notFoundError: ApiError = {
      code: 404,
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: request.id,
    };

    return reply.status(404).send(notFoundError);
  });

  console.log('✅ Error handlers registered successfully');
}

function getErrorName(statusCode: number): string {
  const errorNames: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };

  return errorNames[statusCode] || 'Unknown Error';
}