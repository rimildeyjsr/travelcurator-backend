import { FastifyInstance } from 'fastify';
import { config } from '@shared/config';
import { NotFoundError, AppError } from '@shared/errors';

export interface HealthResponse {
  status: string;
  timestamp: string;
  service: string;
  environment: string;
  uptime: number;
  memory: {
    used: string;
    total: string;
  };
}

export interface ApiInfoResponse {
  message: string;
  version: string;
  environment: string;
  docs: string;
}

async function healthRoutes(
  fastify: FastifyInstance,
  // options: FastifyPluginOptions
): Promise<void> {

  // Health check endpoint
  fastify.get<{ Reply: HealthResponse }>('/health', async () => {
    const memUsage = process.memoryUsage();

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

  // API information endpoint
  fastify.get<{ Reply: ApiInfoResponse }>('/api/info', async () => {
    return {
      message: 'TravelCurator API - Your AI travel companion',
      version: '1.0.0',
      environment: config.server.nodeEnv,
      docs: '/api/docs',
    };
  });

  // Error testing endpoints (development only)
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