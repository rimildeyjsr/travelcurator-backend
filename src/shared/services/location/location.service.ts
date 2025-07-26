import { config } from '@shared/config';
import { AppError } from '@shared/errors';
import { db } from '@shared/database';
import {
  LocationProvider,
  LocationSearchRequest,
  LocationSearchResponse,
  Place,
  POICategory,
  MOOD_CATEGORY_MAPPING,
  LocationServiceConfig
} from './types';

interface CacheEntry {
  data: LocationSearchResponse;
  timestamp: number;
}

export class LocationService {
  private providers: Map<string, LocationProvider> = new Map();
  private cache: Map<string, CacheEntry> = new Map();
  private serviceConfig: LocationServiceConfig;

  constructor() {
    this.serviceConfig = {
      primaryProvider: (config.location?.primaryProvider as any) || 'osm',
      fallbackProvider: config.location?.fallbackProvider as any,
      enableCaching: config.location?.enableCaching ?? true,
      cacheTimeout: config.location?.cacheTimeout || 300, // 5 minutes
      defaultRadius: config.location?.defaultRadius || 2000, // 2km
      maxRadius: config.location?.maxRadius || 10000, // 10km
      resultsPerCategory: config.location?.resultsPerCategory || 10
    };

    this.initializeProviders();
  }

  private initializeProviders(): void {
    // We'll import and initialize providers here
    // For now, we'll prepare the structure

    // Future: Dynamic provider loading
    // if (this.serviceConfig.primaryProvider === 'osm') {
    //   const { OSMProvider } = await import('./providers/osm.provider');
    //   this.providers.set('osm', new OSMProvider());
    // }
  }

  async searchNearby(request: LocationSearchRequest): Promise<LocationSearchResponse> {
    // Validate and normalize request
    const normalizedRequest = this.normalizeRequest(request);

    // Generate cache key
    const cacheKey = this.generateCacheKey(normalizedRequest);

    // Check cache first
    if (this.serviceConfig.enableCaching) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Try database first for existing locations
    const dbResults = await this.searchDatabase(normalizedRequest);

    // If we have sufficient results from database, return them
    if (dbResults.places.length >= normalizedRequest.limit!) {
      const response = {
        places: dbResults.places.slice(0, normalizedRequest.limit),
        metadata: {
          ...dbResults.metadata,
          provider: 'database',
          cached: false
        }
      };

      if (this.serviceConfig.enableCaching) {
        this.setCache(cacheKey, response);
      }

      return response;
    }

    // Search external providers for fresh data
    try {
      const providerResponse = await this.searchProviders(normalizedRequest);

      // Store new places in database
      await this.storePlacesInDatabase(providerResponse.places);

      // Cache the response
      if (this.serviceConfig.enableCaching) {
        this.setCache(cacheKey, providerResponse);
      }

      return providerResponse;
    } catch (error) {
      // If provider search fails, return database results as fallback
      if (dbResults.places.length > 0) {
        console.warn('Provider search failed, returning database results:', error);
        return {
          ...dbResults,
          metadata: {
            ...dbResults.metadata,
            provider: 'database-fallback'
          }
        };
      }

      throw new AppError(
        `Location search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        503
      );
    }
  }

  private normalizeRequest(request: LocationSearchRequest): Required<LocationSearchRequest> {
    // Apply mood-based category selection if no categories specified
    let categories = request.categories;
    if (!categories && request.mood) {
      categories = MOOD_CATEGORY_MAPPING[request.mood] || [];
    }

    return {
      latitude: request.latitude,
      longitude: request.longitude,
      radius: Math.min(request.radius || this.serviceConfig.defaultRadius, this.serviceConfig.maxRadius),
      categories: categories || Object.values(POICategory),
      mood: request.mood || 'curious',
      limit: request.limit || this.serviceConfig.resultsPerCategory,
      excludeChains: request.excludeChains || false
    };
  }

  private async searchDatabase(request: Required<LocationSearchRequest>): Promise<LocationSearchResponse> {
    const startTime = Date.now();

    const locations = await db.location.findNearby({
      latitude: request.latitude,
      longitude: request.longitude,
      radius: request.radius,
      categories: request.categories.map(cat => cat.toString()),
      limit: request.limit
    });

    const places: Place[] = locations.map(location => ({
      id: location.id,
      name: location.name,
      category: location.category as POICategory,
      subcategory: location.category,
      coordinates: {
        latitude: location.latitude,
        longitude: location.longitude
      },
      distance: location.distance,
      ...(location.address && { address: location.address }),
      ...(location.description && { description: location.description }),
      metadata: {
        source: location.source as any,
        externalId: location.externalId || location.id,
        lastUpdated: location.lastUpdated,
        verified: location.verified,
        ...(location.metadata as any)
      }
    }));

    return {
      places,
      metadata: {
        provider: 'database',
        responseTime: Date.now() - startTime,
        totalResults: places.length,
        searchRadius: request.radius,
        categoriesSearched: request.categories.map(cat => cat.toString())
      }
    };
  }

  private async searchProviders(request: Required<LocationSearchRequest>): Promise<LocationSearchResponse> {
    const provider = this.providers.get(this.serviceConfig.primaryProvider);
    if (!provider) {
      throw new Error(`Primary provider '${this.serviceConfig.primaryProvider}' not available`);
    }

    return await provider.searchNearby(request);
  }

  private async storePlacesInDatabase(places: Place[]): Promise<void> {
    // Store places in database for future caching
    for (const place of places) {
      try {
        await db.location.upsertLocation({
          externalId: place.metadata.externalId,
          source: place.metadata.source,
          name: place.name,
          latitude: place.coordinates.latitude,
          longitude: place.coordinates.longitude,
          category: place.category,
          address: place.address || null,
          description: place.description || null,
          metadata: place.metadata
        });
      } catch (error) {
        // Log error but don't fail the entire operation
        console.warn(`Failed to store place ${place.name}:`, error);
      }
    }
  }

  private generateCacheKey(request: Required<LocationSearchRequest>): string {
    const keyData = {
      lat: Math.round(request.latitude * 1000) / 1000,
      lng: Math.round(request.longitude * 1000) / 1000,
      radius: request.radius,
      categories: request.categories.sort().join(','),
      mood: request.mood,
      limit: request.limit
    };

    return Buffer.from(JSON.stringify(keyData)).toString('base64');
  }

  private getFromCache(key: string): LocationSearchResponse | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > this.serviceConfig.cacheTimeout * 1000;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    entry.data.metadata.cached = true;
    return entry.data;
  }

  private setCache(key: string, data: LocationSearchResponse): void {
    const clonedData = JSON.parse(JSON.stringify(data));
    clonedData.metadata.cached = false;

    this.cache.set(key, {
      data: clonedData,
      timestamp: Date.now()
    });

    // Simple cache cleanup
    if (this.cache.size > 100) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  // Utility methods
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  getCurrentProvider(): string {
    return this.serviceConfig.primaryProvider;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  async getPlaceDetails(id: string): Promise<Place | null> {
    // First try database
    const location = await db.location.findById(id);
    if (location) {
      return {
        id: location.id,
        name: location.name,
        category: location.category as POICategory,
        subcategory: location.category,
        coordinates: {
          latitude: location.latitude,
          longitude: location.longitude
        },
        ...(location.address && { address: location.address }),
        ...(location.description && { description: location.description }),
        metadata: {
          source: location.source as any,
          externalId: location.externalId || location.id,
          lastUpdated: location.lastUpdated,
          verified: location.verified,
          ...(location.metadata as any)
        }
      };
    }

    return null;
  }

  async refreshStaleData(): Promise<void> {
    // Background job to refresh stale location data
    const staleLocations = await db.location.findStaleLocations(24); // 24 hours
    console.log(`Found ${staleLocations.length} stale locations to refresh`);

    // TODO: Implement background refresh logic
    // This would re-query providers for updated information
  }
}

// Export singleton instance
export const locationService = new LocationService();