import { FastifyInstance } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { config } from '@shared/config';
import { NotFoundError, AppError } from '@shared/errors';
import { HelloRequestSchema, HelloResponseSchema } from '@shared/schemas/hello.schema';
import { db } from '@shared/database';

export interface ApiInfoResponse {
  message: string;
  version: string;
  environment: string;
  docs: string;
}

async function healthRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // Add TypeBox support to this route plugin
  const server = fastify.withTypeProvider<TypeBoxTypeProvider>();

  // Your existing health check endpoint
  fastify.get('/health', async () => {
    const memUsage = process.memoryUsage();

    const dbHealthy = await db.healthCheck();

    if (!dbHealthy) {
      return {
        status: 'error',
        message: 'Database connection failed'
      }
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'TravelCurator Backend',
      environment: config.server.nodeEnv,
      uptime: Math.floor(process.uptime()),
      memory: {
        used: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      },
    };
  });

  // Your existing API info endpoint
  fastify.get<{ Reply: ApiInfoResponse }>('/api/info', async () => {
    return {
      message: 'TravelCurator API - Your AI travel companion',
      version: '1.0.0',
      environment: config.server.nodeEnv,
      docs: '/api/docs',
    };
  });

  // NEW: Add a validated hello endpoint
  server.post('/api/hello', {
    schema: {
      body: HelloRequestSchema,
      response: {
        200: HelloResponseSchema
      }
    }
  }, async (request) => {
    // TypeScript now KNOWS request.body has a 'name' property that's a string!
    const { name } = request.body;

    return {
      message: `Hello, ${name}! Welcome to TravelCurator API.`,
      timestamp: new Date().toISOString()
    };
  });

  // Your existing error testing endpoints
  if (config.server.nodeEnv === 'development') {
    fastify.get('/api/test/404', async () => {
      throw new NotFoundError('Test resource');
    });

    fastify.get('/api/test/500', async () => {
      throw new AppError('Test internal server error', 500);
    });

    fastify.get('/api/test/unhandled', async () => {
      throw new Error('Unhandled error with sensitive info: password123');
    });
  }
}

export default healthRoutes;