import Fastify from 'fastify';
import { config } from './shared/config.js';
import { registerErrorHandler } from './shared/errors/index.js';
import healthRoutes from './features/health/health.routes.js';

const fastify = Fastify({
  logger: {
    level: config.server.nodeEnv === 'production' ? 'warn' : 'info'
  },
  disableRequestLogging: false,
  requestIdHeader: false,
  genReqId: () => Math.random().toString(36).substring(2, 15),
});

// Register error handling first
registerErrorHandler(fastify);

// Register middleware and routes
const setupServer = async () => {
  // Security & CORS middleware
  await fastify.register(import('@fastify/helmet'), {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  });

  await fastify.register(import('@fastify/cors'), {
    origin: config.server.nodeEnv === 'development'
      ? ['http://localhost:3000', 'http://localhost:19006']
      : ['https://your-frontend-domain.com'],
    credentials: true,
  });

  await fastify.register(import('@fastify/rate-limit'), {
    max: config.server.nodeEnv === 'development' ? 1000 : 100,
    timeWindow: '1 minute',
    errorResponseBuilder: (_, context) => {
      return {
        code: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
      };
    },
  });

  // Register route modules
  await fastify.register(healthRoutes);
};

// Start the server
const start = async (): Promise<void> => {
  try {
    await setupServer();

    await fastify.listen({
      port: config.server.port,
      host: config.server.host
    });

    console.log(`🚀 TravelCurator Backend running on http://localhost:${config.server.port}`);
    console.log(`📍 Environment: ${config.server.nodeEnv}`);
  } catch (err) {
    console.error('Server failed to start:', err);
    process.exit(1);
  }
};

start();