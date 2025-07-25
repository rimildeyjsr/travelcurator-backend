import { FastifyInstance } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  RecommendationRequestSchema,
  RecommendationResponseSchema
} from '@shared/schemas/recommendation.schema';
import { aiService } from '@shared/services';
import { requireAuth } from '@shared/middleware';
import { AppError } from '@shared/errors';
import { config } from '@shared/config'; // Add this import

async function recommendationsRoutes(fastify: FastifyInstance): Promise<void> {
  const server = fastify.withTypeProvider<TypeBoxTypeProvider>();

  // Generate AI recommendations endpoint
  server.post('/api/recommendations/generate', {
    preHandler: requireAuth(),
    schema: {
      body: RecommendationRequestSchema,
      response: {
        200: RecommendationResponseSchema
      }
    }
  }, async (request) => { // Remove 'reply' parameter since it's unused
    try {
      const recommendations = await aiService.generateRecommendations(request.body);

      // Log successful generation for monitoring
      fastify.log.info({
        userId: request.user?.id,
        provider: recommendations.metadata.provider,
        responseTime: recommendations.metadata.responseTime,
        cached: recommendations.metadata.cached,
        recommendationCount: recommendations.recommendations.length
      }, 'AI recommendations generated');

      return recommendations;
    } catch (error) {
      fastify.log.error({
        userId: request.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestBody: request.body
      }, 'Failed to generate recommendations');

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('Failed to generate recommendations', 500);
    }
  });

  // Get available AI providers (useful for debugging/admin)
  server.get('/api/recommendations/providers', {
    preHandler: requireAuth()
  }, async () => {
    return {
      current: aiService.getCurrentProvider(),
      available: aiService.getAvailableProviders(),
      cacheStats: aiService.getCacheStats()
    };
  });

  // Clear recommendation cache (useful for development)
  if (config.server.nodeEnv === 'development') { // Use imported config instead of fastify.config
    server.delete('/api/recommendations/cache', {
      preHandler: requireAuth()
    }, async () => {
      aiService.clearCache();
      return { message: 'Cache cleared successfully' };
    });
  }
}

export default recommendationsRoutes;