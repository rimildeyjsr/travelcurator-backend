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
import { POICategory } from '@shared/services/location/types';

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
      const {
        latitude,
        longitude,
        radius,
        categories,
        mood,
        limit,
        excludeChains
      } = request.body;

      // Build service request with proper defaults to avoid undefined values
      const serviceRequest = {
        latitude,
        longitude,
        // Provide defaults for optional properties to satisfy exactOptionalPropertyTypes
        ...(radius !== undefined && { radius }),
        ...(categories !== undefined && { categories: categories.map(cat => cat as POICategory) }),
        ...(mood !== undefined && { mood }),
        ...(limit !== undefined && { limit }),
        ...(excludeChains !== undefined && { excludeChains })
      };

      const searchResult = await locationService.searchNearby(serviceRequest);

      // Convert service response to match schema exactly
      const response = {
        places: searchResult.places.map(place => {
          // Ensure source is one of the allowed values, fallback to 'manual' if unknown
          const validSource = place.metadata?.source;
          const schemaSource: 'osm' | 'google' | 'manual' =
            validSource === 'osm' || validSource === 'google' || validSource === 'manual'
              ? validSource
              : 'manual';

          return {
            id: place.id,
            name: place.name,
            category: place.category as any, // Cast to match schema literal types
            subcategory: place.subcategory,
            coordinates: place.coordinates,
            // Only include distance if it's a valid number
            ...(typeof place.distance === 'number' && { distance: place.distance }),
            // Only include optional string properties if they exist
            ...(place.description && { description: place.description }),
            ...(place.address && { address: place.address }),
            metadata: {
              source: schemaSource,
              externalId: place.metadata?.externalId || place.id,
              lastUpdated: place.metadata?.lastUpdated?.toISOString() || new Date().toISOString(),
              verified: place.metadata?.verified || false,
              // Include optional nested properties only if they exist
              ...(place.metadata?.osm && { osm: place.metadata.osm }),
              ...(place.metadata?.google && { google: place.metadata.google }),
              ...(place.metadata?.contact && { contact: place.metadata.contact }),
              ...(place.metadata?.hours && { hours: place.metadata.hours }),
              ...(place.metadata?.features && { features: place.metadata.features })
            }
          };
        }),
        metadata: {
          provider: searchResult.metadata.provider,
          responseTime: searchResult.metadata.responseTime,
          totalResults: searchResult.metadata.totalResults,
          searchRadius: searchResult.metadata.searchRadius,
          categoriesSearched: searchResult.metadata.categoriesSearched,
          ...(searchResult.metadata.cached !== undefined && { cached: searchResult.metadata.cached }),
          // ADDED: Include hybrid-specific metadata if available
          ...(searchResult.metadata.osmPlaces !== undefined && { osmPlaces: searchResult.metadata.osmPlaces }),
          ...(searchResult.metadata.googleEnrichments !== undefined && { googleEnrichments: searchResult.metadata.googleEnrichments }),
          ...(searchResult.metadata.costOptimization !== undefined && { costOptimization: searchResult.metadata.costOptimization }),
          ...(searchResult.metadata.fallbackReason !== undefined && { fallbackReason: searchResult.metadata.fallbackReason })
        }
      };

      // Log search for analytics
      fastify.log.info({
        userId: request.user?.id,
        searchRadius: radius,
        categories,
        mood,
        resultsCount: response.places.length,
        provider: response.metadata.provider,
        responseTime: response.metadata.responseTime,
        cached: response.metadata.cached,
        // ADDED: Log hybrid-specific metrics
        ...(response.metadata.osmPlaces !== undefined && { osmPlaces: response.metadata.osmPlaces }),
        ...(response.metadata.googleEnrichments !== undefined && { googleEnrichments: response.metadata.googleEnrichments })
      }, 'Location search performed');

      return response;
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

      // Ensure source is valid for schema
      const validSource = place.metadata?.source;
      const schemaSource: 'osm' | 'google' | 'manual' =
        validSource === 'osm' || validSource === 'google' || validSource === 'manual'
          ? validSource
          : 'manual';

      return {
        place: {
          id: place.id,
          name: place.name,
          category: place.category as any, // Cast to match schema literal types
          subcategory: place.subcategory,
          coordinates: place.coordinates,
          ...(typeof place.distance === 'number' && { distance: place.distance }),
          ...(place.description && { description: place.description }),
          ...(place.address && { address: place.address }),
          metadata: {
            source: schemaSource,
            externalId: place.metadata?.externalId || place.id,
            lastUpdated: place.metadata?.lastUpdated?.toISOString() || new Date().toISOString(),
            verified: place.metadata?.verified || false,
            ...(place.metadata?.osm && { osm: place.metadata.osm }),
            ...(place.metadata?.google && { google: place.metadata.google }),
            ...(place.metadata?.contact && { contact: place.metadata.contact }),
            ...(place.metadata?.hours && { hours: place.metadata.hours }),
            ...(place.metadata?.features && { features: place.metadata.features })
          }
        },
        metadata: {
          provider: schemaSource,
          lastUpdated: place.metadata?.lastUpdated?.toISOString() || new Date().toISOString(),
          verified: place.metadata?.verified || false
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
      // Build service request with required properties only
      const serviceRequest = {
        latitude,
        longitude,
        radius,
        mood,
        limit
      };

      const searchResult = await locationService.searchNearby(serviceRequest);

      const response = {
        places: searchResult.places.map(place => {
          const validSource = place.metadata?.source;
          const schemaSource: 'osm' | 'google' | 'manual' =
            validSource === 'osm' || validSource === 'google' || validSource === 'manual'
              ? validSource
              : 'manual';

          return {
            id: place.id,
            name: place.name,
            category: place.category as any,
            subcategory: place.subcategory,
            coordinates: place.coordinates,
            ...(typeof place.distance === 'number' && { distance: place.distance }),
            ...(place.description && { description: place.description }),
            ...(place.address && { address: place.address }),
            metadata: {
              source: schemaSource,
              externalId: place.metadata?.externalId || place.id,
              lastUpdated: place.metadata?.lastUpdated?.toISOString() || new Date().toISOString(),
              verified: place.metadata?.verified || false,
              ...(place.metadata?.osm && { osm: place.metadata.osm }),
              ...(place.metadata?.google && { google: place.metadata.google }),
              ...(place.metadata?.contact && { contact: place.metadata.contact }),
              ...(place.metadata?.hours && { hours: place.metadata.hours }),
              ...(place.metadata?.features && { features: place.metadata.features })
            }
          };
        }),
        metadata: {
          provider: searchResult.metadata.provider,
          responseTime: searchResult.metadata.responseTime,
          totalResults: searchResult.metadata.totalResults,
          searchRadius: searchResult.metadata.searchRadius,
          categoriesSearched: searchResult.metadata.categoriesSearched,
          ...(searchResult.metadata.cached !== undefined && { cached: searchResult.metadata.cached }),
          // ADDED: Include hybrid-specific metadata
          ...(searchResult.metadata.osmPlaces !== undefined && { osmPlaces: searchResult.metadata.osmPlaces }),
          ...(searchResult.metadata.googleEnrichments !== undefined && { googleEnrichments: searchResult.metadata.googleEnrichments }),
          ...(searchResult.metadata.costOptimization !== undefined && { costOptimization: searchResult.metadata.costOptimization })
        }
      };

      fastify.log.info({
        userId: request.user?.id,
        mood,
        coordinates: { latitude, longitude },
        radius,
        resultsCount: response.places.length,
        provider: response.metadata.provider,
        // ADDED: Log hybrid metrics
        ...(response.metadata.osmPlaces !== undefined && { osmPlaces: response.metadata.osmPlaces }),
        ...(response.metadata.googleEnrichments !== undefined && { googleEnrichments: response.metadata.googleEnrichments })
      }, 'Mood-based location search');

      return response;
    } catch (error) {
      throw new AppError('Mood-based search failed', 500);
    }
  });

  // Provider status and testing endpoints
  server.get('/api/locations/providers/status', {
    preHandler: requireAuth()
  }, async () => {
    return {
      currentProvider: locationService.getCurrentProvider(),
      availableProviders: locationService.getAvailableProviders(),
      providerStatus: locationService.getProviderStatus(),
      cacheStats: locationService.getCacheStats()
    };
  });

  // Switch provider (for testing) - UPDATED TO INCLUDE HYBRID
  if (config.server.nodeEnv === 'development') {
    server.post('/api/locations/providers/switch', {
      preHandler: requireAuth(),
      schema: {
        body: {
          type: 'object',
          properties: {
            provider: {
              type: 'string',
              enum: ['osm', 'google', 'hybrid'] // ADDED hybrid
            }
          },
          required: ['provider']
        }
      }
    }, async (request) => {
      const { provider } = request.body as { provider: 'osm' | 'google' | 'hybrid' }; // ADDED hybrid

      const success = await locationService.switchProvider(provider);

      if (success) {
        return {
          message: `Successfully switched to ${provider} provider`,
          currentProvider: locationService.getCurrentProvider(),
          availableProviders: locationService.getAvailableProviders()
        };
      } else {
        throw new AppError(`Provider '${provider}' is not available`, 400);
      }
    });

    // Test provider with sample query - UPDATED TO INCLUDE HYBRID
    server.post('/api/locations/providers/test', {
      preHandler: requireAuth(),
      schema: {
        body: {
          type: 'object',
          properties: {
            provider: {
              type: 'string',
              enum: ['osm', 'google', 'hybrid'] // ADDED hybrid
            },
            latitude: { type: 'number', minimum: -90, maximum: 90 },
            longitude: { type: 'number', minimum: -180, maximum: 180 }
          },
          required: ['provider', 'latitude', 'longitude']
        }
      }
    }, async (request) => {
      const { provider, latitude, longitude } = request.body as {
        provider: 'osm' | 'google' | 'hybrid'; // ADDED hybrid
        latitude: number;
        longitude: number;
      };

      const originalProvider = locationService.getCurrentProvider();

      try {
        // Switch to test provider
        const switched = await locationService.switchProvider(provider);
        if (!switched) {
          throw new AppError(`Provider '${provider}' is not available`, 400);
        }

        // Run test search
        const result = await locationService.searchNearby({
          latitude,
          longitude,
          radius: 1000,
          limit: 5
        });

        // Switch back to original provider
        await locationService.switchProvider(originalProvider as 'osm' | 'google' | 'hybrid'); // UPDATED type

        return {
          message: `Successfully tested ${provider} provider`,
          testResults: {
            provider,
            placesFound: result.places.length,
            responseTime: result.metadata.responseTime,
            samplePlace: result.places[0] || null,
            // ADDED: Show hybrid-specific metadata if available
            ...(result.metadata.osmPlaces !== undefined && {
              osmPlaces: result.metadata.osmPlaces,
              googleEnrichments: result.metadata.googleEnrichments,
              costOptimization: result.metadata.costOptimization
            })
          }
        };
      } catch (error) {
        // Make sure to switch back even if test fails
        await locationService.switchProvider(originalProvider as 'osm' | 'google' | 'hybrid'); // UPDATED type
        throw error;
      }
    });
  }

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
      // Test with a simple search (Times Square, NYC)
      const testResult = await locationService.searchNearby({
        latitude: 40.7589,
        longitude: -73.9851,
        radius: 1000,
        limit: 1
      });

      return {
        status: 'healthy',
        currentProvider: locationService.getCurrentProvider(),
        availableProviders: locationService.getAvailableProviders(),
        lastSearch: {
          responseTime: testResult.metadata.responseTime,
          resultsFound: testResult.places.length,
          provider: testResult.metadata.provider,
          // ADDED: Include hybrid metrics in health check
          ...(testResult.metadata.osmPlaces !== undefined && { osmPlaces: testResult.metadata.osmPlaces }),
          ...(testResult.metadata.googleEnrichments !== undefined && { googleEnrichments: testResult.metadata.googleEnrichments })
        }
      };
    } catch (error) {
      throw new AppError('Location service unhealthy', 503);
    }
  });
}

export default locationsRoutes;