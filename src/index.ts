// src/index.ts (UPDATED)
import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { config } from '@shared/config';
import { registerErrorHandler } from '@shared/errors';
import healthRoutes from './features/health/health.routes.js';
import authRoutes from './features/auth/auth.routes.js';
import recommendationsRoutes from './features/recommendations/recommendations.routes.js';
import locationsRoutes from './features/locations/locations.routes.js'; // Add this

const fastify = Fastify({
  logger: {
    level: config.server.nodeEnv === 'production' ? 'warn' : 'info'
  },
  disableRequestLogging: false,
  requestIdHeader: false,
  genReqId: () => Math.random().toString(36).substring(2, 15),
}).withTypeProvider<TypeBoxTypeProvider>();

// Register error handling first
registerErrorHandler(fastify);

const setupServer = async () => {
  // Security middleware
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

  // CORS configuration
  await fastify.register(import('@fastify/cors'), {
    origin: config.server.nodeEnv === 'development'
      ? ['http://localhost:3000', 'http://localhost:19006']
      : ['https://your-frontend-domain.com'],
    credentials: true,
  });

  // Rate limiting
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
  await fastify.register(authRoutes);
  await fastify.register(recommendationsRoutes);
  await fastify.register(locationsRoutes);
};

const start = async (): Promise<void> => {
  try {
    await setupServer();

    await fastify.listen({
      port: config.server.port,
      host: config.server.host
    });

    console.log(`🚀 TravelCurator Backend running on http://localhost:${config.server.port}`);
    console.log(`📍 Environment: ${config.server.nodeEnv}`);
    console.log(`🤖 AI Provider: ${config.ai.provider}`);
    console.log(`🗺️ Location Provider: ${config.location.primaryProvider}`);

    // Log available endpoints
    console.log('\n📡 Available API Endpoints:');
    console.log('  Health: GET /health');
    console.log('  Auth: POST /api/auth/register, /api/auth/login, /api/auth/refresh');
    console.log('  AI: POST /api/recommendations/generate');
    console.log('  Locations: POST /api/locations/search, GET /api/locations/:id');
    console.log('  Location Mood: GET /api/locations/nearby/:mood');
  } catch (err) {
    console.error('Server failed to start:', err);
    process.exit(1);
  }
};

start();