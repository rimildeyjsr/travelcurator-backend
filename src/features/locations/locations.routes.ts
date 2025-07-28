import { FastifyInstance } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  LocationSearchRequestSchema,
  LocationSearchResponseSchema,
  PlaceDetailsResponseSchema
} from '@shared/schemas/location.schema';
import { locationService } from '@shared/services';
import { requireAuth } from '@shared/middleware';
import { AppError } from '@shared/errors';
import { config } from '@shared/config';

async function locationsRoutes(fastify: FastifyInstance): Promise<void> {
  const server = fastify.withTypeProvider<TypeBoxTypeProvider>();

  // Search nearby places
  server.post('/api/locations/search', {
    preHandler: requireAuth(),
    schema: {
      body: LocationSearchRequestSchema,
      response: {
        200: LocationSearchResponseSchema
      }
    }
  }, async (request) => {
    try {
      const searchResult = await locationService.searchNearby(request.body);

      // Log search for analytics
      fastify.log.info({
        userId: request.user?.id,
        searchRadius: request.body.radius,
        categories: request.body.categories,
        mood: request.body.mood,
        resultsCount: searchResult.places.length,
        provider: searchResult.metadata.provider,
        responseTime: searchResult.metadata.responseTime,
        cached: searchResult.metadata.cached
      }, 'Location search performed');

      return searchResult;
    } catch (error) {
      fastify.log.error({
        userId: request.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestBody: request.body
      }, 'Location search failed');

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('Location search failed', 500);
    }
  });

  // Get place details by ID
  server.get('/api/locations/:id', {
    preHandler: requireAuth(),
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      response: {
        200: PlaceDetailsResponseSchema
      }
    }
  }, async (request) => {
    const { id } = request.params as { id: string };

    try {
      const place = await locationService.getPlaceDetails(id);

      if (!place) {
        throw new AppError('Place not found', 404);
      }

      fastify.log.info({
        userId: request.user?.id,
        placeId: id,
        placeName: place.name
      }, 'Place details retrieved');

      return {
        place,
        metadata: {
          provider: place.metadata.source,
          lastUpdated: place.metadata.lastUpdated,
          verified: place.metadata.verified
        }
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('Failed to retrieve place details', 500);
    }
  });

  // Get nearby places with specific mood filter
  server.get('/api/locations/nearby/:mood', {
    preHandler: requireAuth(),
    schema: {
      params: {
        type: 'object',
        properties: {
          mood: {
            type: 'string',
            enum: ['energetic', 'relaxed', 'curious', 'hungry', 'cultural']
          }
        },
        required: ['mood']
      },
      querystring: {
        type: 'object',
        properties: {
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
          radius: { type: 'number', minimum: 100, maximum: 10000, default: 2000 },
          limit: { type: 'number', minimum: 1, maximum: 50, default: 10 }
        },
        required: ['latitude', 'longitude']
      },
      response: {
        200: LocationSearchResponseSchema
      }
    }
  }, async (request) => {
    const { mood } = request.params as { mood: 'energetic' | 'relaxed' | 'curious' | 'hungry' | 'cultural' };
    const { latitude, longitude, radius = 2000, limit = 10 } = request.query as {
      latitude: number;
      longitude: number;
      radius?: number;
      limit?: number;
    };

    try {
      const searchResult = await locationService.searchNearby({
        latitude,
        longitude,
        radius,
        mood,
        limit
      });

      fastify.log.info({
        userId: request.user?.id,
        mood,
        coordinates: { latitude, longitude },
        radius,
        resultsCount: searchResult.places.length
      }, 'Mood-based location search');

      return searchResult;
    } catch (error) {
      throw new AppError('Mood-based search failed', 500);
    }
  });

  // Cache management endpoints (development only)
  if (config.server.nodeEnv === 'development') {
    // Get cache statistics
    server.get('/api/locations/cache/stats', {
      preHandler: requireAuth()
    }, async () => {
      return {
        location: locationService.getCacheStats(),
        currentProvider: locationService.getCurrentProvider(),
        availableProviders: locationService.getAvailableProviders()
      };
    });

    // Clear location cache
    server.delete('/api/locations/cache', {
      preHandler: requireAuth()
    }, async () => {
      locationService.clearCache();
      return { message: 'Location cache cleared successfully' };
    });

    // Refresh stale location data
    server.post('/api/locations/refresh', {
      preHandler: requireAuth()
    }, async () => {
      // Trigger background refresh (non-blocking)
      locationService.refreshStaleData().catch(error => {
        fastify.log.error('Background location refresh failed:', error);
      });

      return { message: 'Background location refresh initiated' };
    });
  }

  // Health check for location service
  server.get('/api/locations/health', {
    preHandler: requireAuth()
  }, async () => {
    try {
      // Test with a simple search
      const testResult = await locationService.searchNearby({
        latitude: 40.7831, // New York City
        longitude: -73.9712,
        radius: 1000,
        limit: 1
      });

      return {
        status: 'healthy',
        provider: locationService.getCurrentProvider(),
        lastSearch: {
          responseTime: testResult.metadata.responseTime,
          resultsFound: testResult.places.length
        }
      };
    } catch (error) {
      throw new AppError('Location service unhealthy', 503);
    }
  });
}

export default locationsRoutes;