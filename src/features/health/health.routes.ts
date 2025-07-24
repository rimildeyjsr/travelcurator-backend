import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { config } from '@shared/config';

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
  options: FastifyPluginOptions
): Promise<void> {

  // Health check endpoint
  fastify.get<{ Reply: HealthResponse }>('/health', async (request, reply) => {
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
  fastify.get<{ Reply: ApiInfoResponse }>('/api/info', async (request, reply) => {
    return {
      message: 'TravelCurator API - Your AI travel companion',
      version: '1.0.0',
      environment: config.server.nodeEnv,
      docs: '/api/docs', // We'll add API docs later
    };
  });
}

export default healthRoutes;