import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
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
}).withTypeProvider<TypeBoxTypeProvider>(); // Add this line for TypeBox support

// Register error handling first
registerErrorHandler(fastify);

// Rest of your existing code stays the same...
const setupServer = async () => {
  // Your existing middleware setup
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

// Your existing start function stays the same
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