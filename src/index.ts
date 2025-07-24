import Fastify from 'fastify';
import { config } from './shared/config.js';
import healthRoutes from './features/health/health.routes.js';

const fastify = Fastify({
  logger: {
    level: config.server.nodeEnv === 'production' ? 'warn' : 'info'
  },
  disableRequestLogging: false,
  requestIdHeader: false, // Disable request tracing
});

// Security & CORS middleware
await fastify.register(import('@fastify/helmet'), {
  // Configure security headers
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
  // Configure CORS for frontend communication
  origin: config.server.nodeEnv === 'development'
    ? ['http://localhost:3000', 'http://localhost:19006'] // React/Expo dev servers
    : ['https://your-frontend-domain.com'], // Production frontend
  credentials: true, // Allow cookies/auth headers
});

await fastify.register(import('@fastify/rate-limit'), {
  // Prevent abuse
  max: config.server.nodeEnv === 'development' ? 1000 : 100, // requests per window
  timeWindow: '1 minute',
  errorResponseBuilder: (request, context) => {
    return {
      code: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
    };
  },
});

// Register route modules
await fastify.register(healthRoutes);

// Start the server
const start = async (): Promise<void> => {
  try {
    await fastify.listen({
      port: config.server.port,
      host: config.server.host
    });
    console.log(`🚀 TravelCurator Backend running on http://localhost:${config.server.port}`);
    console.log(`📍 Environment: ${config.server.nodeEnv}`);
    console.log(`🔒 Security middleware active`);
    console.log(`📚 Routes registered: health`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();