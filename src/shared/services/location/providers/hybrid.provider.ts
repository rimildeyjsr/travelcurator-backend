// src/shared/services/location/providers/hybrid.provider.ts

import { config } from '@shared/config';
import { db } from '@shared/database';
import {
  LocationProvider,
  LocationSearchRequest,
  LocationSearchResponse,
  Place,
  POICategory
} from '../types';
import { OSMProvider } from './osm.provider';
import { GooglePlacesProvider } from './google.provider';

interface MergeCandidate {
  osmPlace: Place;
  googlePlace: Place; // Remove undefined - we only create candidates when both exist
  distance: number; // meters between coordinates
  nameSimilarity: number; // 0-1 score
  confidence: number; // 0-1 merge confidence
}

interface CostOptimizationConfig {
  maxGoogleEnrichments: number; // Limit Google API calls per search
  minReviewsForEnrichment: number; // Only enrich popular places
  popularPlaceRadius: number; // Consider place popular if within this radius of city center
}

export class HybridProvider implements LocationProvider {
  private osmProvider: OSMProvider;
  private googleProvider: GooglePlacesProvider | null = null;
  private costConfig: CostOptimizationConfig;

  constructor() {
    this.osmProvider = new OSMProvider();

    // Initialize Google provider if available
    try {
      if (config.apis.googlePlaces) {
        this.googleProvider = new GooglePlacesProvider();
      }
    } catch (error) {
      console.warn('Google Places provider not available:', error);
    }

    this.costConfig = {
      maxGoogleEnrichments: 10, // Max 10 Google calls per search
      minReviewsForEnrichment: 5, // Only enrich places with 5+ reviews
      popularPlaceRadius: 5000 // 5km from search center
    };
  }

  async searchNearby(request: LocationSearchRequest): Promise<LocationSearchResponse> {
    const startTime = Date.now();

    try {
      // Step 1: Get comprehensive results from OSM (free)
      console.log('🔍 Searching OSM for comprehensive coverage...');
      const osmResults = await this.osmProvider.searchNearby(request);

      // Step 2: Selectively enrich with Google data (cost-aware)
      let enrichedPlaces = osmResults.places;
      let googleEnrichments = 0;

      if (this.googleProvider && this.shouldUseGoogleEnrichment(request)) {
        console.log('💎 Enriching with Google Places data...');

        // Get Google results for comparison and enrichment
        const googleResults = await this.getGoogleResults(request);

        // Intelligent merging
        const mergeResults = await this.mergeProviderData(
          osmResults.places,
          googleResults.places,
          request
        );

        enrichedPlaces = mergeResults.mergedPlaces;
        googleEnrichments = mergeResults.googleEnrichments;
      }

      // Step 3: Store merged results for future use
      await this.storeMergedResults(enrichedPlaces);

      return {
        places: enrichedPlaces,
        metadata: {
          provider: 'hybrid',
          responseTime: Date.now() - startTime,
          totalResults: enrichedPlaces.length,
          searchRadius: request.radius || 2000,
          categoriesSearched: request.categories?.map(cat => cat.toString()) || [],
          cached: false,
          // Enhanced metadata for cost tracking
          osmPlaces: osmResults.places.length,
          googleEnrichments,
          costOptimization: {
            maxGoogleCalls: this.costConfig.maxGoogleEnrichments,
            actualGoogleCalls: googleEnrichments,
            costSavings: `${((this.costConfig.maxGoogleEnrichments - googleEnrichments) / this.costConfig.maxGoogleEnrichments * 100).toFixed(0)}%`
          }
        }
      };
    } catch (error) {
      console.error('Hybrid search failed:', error);

      // Fallback to OSM only
      console.log('🔄 Falling back to OSM-only results...');
      const fallbackResults = await this.osmProvider.searchNearby(request);
      return {
        ...fallbackResults,
        metadata: {
          ...fallbackResults.metadata,
          provider: 'hybrid-fallback',
          fallbackReason: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  private shouldUseGoogleEnrichment(request: LocationSearchRequest): boolean {
    // Cost optimization: Only use Google for specific scenarios

    // Skip Google for large radius searches (too expensive)
    if ((request.radius || 2000) > 5000) {
      console.log('💰 Skipping Google enrichment: radius too large');
      return false;
    }

    // Skip Google for certain moods that don't benefit from ratings
    if (request.mood === 'curious' && !request.categories?.includes(POICategory.RESTAURANT)) {
      console.log('💰 Skipping Google enrichment: curiosity searches don\'t need ratings');
      return false;
    }

    return true;
  }

  private async getGoogleResults(request: LocationSearchRequest): Promise<LocationSearchResponse> {
    try {
      // Limit Google search to cost-effective categories
      const googleRequest = {
        ...request,
        limit: this.costConfig.maxGoogleEnrichments,
        // Focus on categories that benefit from Google data
        categories: request.categories?.filter(cat =>
          [POICategory.RESTAURANT, POICategory.CAFE, POICategory.BAR, POICategory.ATTRACTION].includes(cat)
        ) || [POICategory.RESTAURANT]
      };

      return await this.googleProvider!.searchNearby(googleRequest);
    } catch (error) {
      console.warn('Google search failed:', error);
      return { places: [], metadata: { provider: 'google-failed', responseTime: 0, totalResults: 0, searchRadius: 0, categoriesSearched: [] } };
    }
  }

  private async mergeProviderData(
    osmPlaces: Place[],
    googlePlaces: Place[],
    request: LocationSearchRequest
  ): Promise<{ mergedPlaces: Place[]; googleEnrichments: number }> {
    console.log(`🔀 Merging ${osmPlaces.length} OSM places with ${googlePlaces.length} Google places...`);

    const mergedPlaces: Place[] = [];
    const usedGooglePlaces = new Set<string>();
    let googleEnrichments = 0;

    // Phase 1: Enhance OSM places with Google data
    for (const osmPlace of osmPlaces) {
      const googleMatch = this.findBestGoogleMatch(osmPlace, googlePlaces);

      if (googleMatch && googleMatch.confidence > 0.7) {
        console.log(`✅ High confidence merge: ${osmPlace.name} + ${googleMatch.googlePlace.name}`);

        const mergedPlace = this.mergePlaceData(osmPlace, googleMatch.googlePlace);
        mergedPlaces.push(mergedPlace);
        usedGooglePlaces.add(googleMatch.googlePlace.id);
        googleEnrichments++;
      } else {
        // Keep OSM place as-is
        mergedPlaces.push({
          ...osmPlace,
          metadata: osmPlace.metadata ? {
            ...osmPlace.metadata,
            source: 'osm' as const,
            // Safe mergeStatus assignment
            mergeStatus: 'osm-only'
          } : {
            source: 'osm' as const,
            externalId: osmPlace.id,
            lastUpdated: new Date(),
            verified: false,
            mergeStatus: 'osm-only'
          }
        });
      }
    }

    // Phase 2: Add Google-only places (not matched with OSM)
    for (const googlePlace of googlePlaces) {
      if (!usedGooglePlaces.has(googlePlace.id)) {
        console.log(`➕ Adding Google-only place: ${googlePlace.name}`);
        mergedPlaces.push({
          ...googlePlace,
          metadata: googlePlace.metadata ? {
            ...googlePlace.metadata,
            source: 'google' as const,
            mergeStatus: 'google-only'
          } : {
            source: 'google' as const,
            externalId: googlePlace.id,
            lastUpdated: new Date(),
            verified: false,
            mergeStatus: 'google-only'
          }
        });
        googleEnrichments++;
      }
    }

    // Sort by quality score (Google rating > OSM completeness)
    mergedPlaces.sort((a, b) => {
      const scoreA = this.calculateQualityScore(a);
      const scoreB = this.calculateQualityScore(b);
      return scoreB - scoreA;
    });

    return {
      mergedPlaces: mergedPlaces.slice(0, request.limit || 20),
      googleEnrichments
    };
  }

  private findBestGoogleMatch(osmPlace: Place, googlePlaces: Place[]): MergeCandidate | null {
    let bestMatch: MergeCandidate | null = null;

    for (const googlePlace of googlePlaces) {
      const distance = this.calculateDistance(
        osmPlace.coordinates.latitude,
        osmPlace.coordinates.longitude,
        googlePlace.coordinates.latitude,
        googlePlace.coordinates.longitude
      );

      // Skip if too far apart (likely different places)
      if (distance > 200) continue; // 200m threshold

      const nameSimilarity = this.calculateNameSimilarity(osmPlace.name, googlePlace.name);

      // Category compatibility check
      const categoryMatch = this.categoriesMatch(osmPlace.category, googlePlace.category);

      const confidence = this.calculateMergeConfidence(distance, nameSimilarity, categoryMatch);

      const candidate: MergeCandidate = {
        osmPlace,
        googlePlace,
        distance,
        nameSimilarity,
        confidence
      };

      if (!bestMatch || candidate.confidence > bestMatch.confidence) {
        bestMatch = candidate;
      }
    }

    return bestMatch;
  }

  private mergePlaceData(osmPlace: Place, googlePlace: Place): Place {
    // Intelligent data merging - use best data from each source

    // Safely extract metadata with proper handling
    const osmMetadata = osmPlace.metadata;
    const googleMetadata = googlePlace.metadata;

    // Build contact info safely
    const mergedContact = {
      ...(osmMetadata?.contact || {}),
      ...(googleMetadata?.contact || {})
    };

    // Build features safely
    const osmFeatures = osmMetadata?.features || [];
    const googleFeatures = googleMetadata?.features || [];
    const mergedFeatures = [...osmFeatures, ...googleFeatures]
      .filter((feature, index, array) => array.indexOf(feature) === index); // deduplicate

    const mergedPlace: Place = {
      id: osmPlace.id, // Keep OSM ID as primary
      name: this.chooseBestName(osmPlace.name, googlePlace.name),
      category: osmPlace.category, // OSM categories are more comprehensive
      subcategory: osmPlace.subcategory,
      coordinates: osmPlace.coordinates, // OSM coordinates often more accurate
      // Handle distance properly - convert undefined to null for type safety
      distance: osmPlace.distance ?? null,
      metadata: {
        source: 'merged' as const,
        externalId: osmMetadata?.externalId || osmPlace.id,
        lastUpdated: new Date(),
        verified: true,
        // Safe string assignment - only include if string exists
        ...(osmMetadata?.mergeStatus && typeof osmMetadata.mergeStatus === 'string' && { mergeStatus: osmMetadata.mergeStatus }),
        ...(!osmMetadata?.mergeStatus && { mergeStatus: 'merged' }),
        // Only include osm data if it exists
        ...(osmMetadata?.osm && { osm: osmMetadata.osm }),
        // Only include google data if it exists
        ...(googleMetadata?.google && { google: googleMetadata.google }),
        // Only include contact if it has properties
        ...(Object.keys(mergedContact).length > 0 && { contact: mergedContact }),
        // Prefer Google hours (more accurate for business hours)
        ...(googleMetadata?.hours && { hours: googleMetadata.hours }),
        ...(osmMetadata?.hours && !googleMetadata?.hours && { hours: osmMetadata.hours }),
        // Only include features if array has items
        ...(mergedFeatures.length > 0 && { features: mergedFeatures })
      }
    };

    // Only add optional properties if they have actual string values
    const googleAddress = googlePlace.address;
    const osmAddress = osmPlace.address;
    const finalAddress = googleAddress || osmAddress;
    if (finalAddress) {
      mergedPlace.address = finalAddress;
    }

    const osmDescription = osmPlace.description;
    const googleDescription = googlePlace.description;
    const finalDescription = osmDescription || googleDescription;
    if (finalDescription) {
      mergedPlace.description = finalDescription;
    }

    return mergedPlace;
  }

  private chooseBestName(osmName: string, googleName: string): string {
    // Prefer more complete names (with more information)
    if (googleName.length > osmName.length && googleName.includes(osmName)) {
      return googleName;
    }
    if (osmName.length > googleName.length && osmName.includes(googleName)) {
      return osmName;
    }
    // Default to OSM name (often more standardized)
    return osmName;
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private calculateNameSimilarity(name1: string, name2: string): number {
    // Normalize names for comparison
    const norm1 = name1.toLowerCase().trim();
    const norm2 = name2.toLowerCase().trim();

    // Exact match
    if (norm1 === norm2) return 1;

    // Check if one contains the other (common for business names)
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      const longer = Math.max(norm1.length, norm2.length);
      const shorter = Math.min(norm1.length, norm2.length);
      return shorter / longer;
    }

    // Use Levenshtein distance for fuzzy matching
    const distance = this.levenshteinDistance(norm1, norm2);
    const maxLength = Math.max(norm1.length, norm2.length);
    return maxLength === 0 ? 0 : 1 - (distance / maxLength);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    // Handle edge cases
    if (str1.length === 0) return str2.length;
    if (str2.length === 0) return str1.length;

    // Create distance matrix with proper typing
    const distances: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= str1.length; i++) {
      distances[i] = [];
      distances[i]![0] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      distances[0]![j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;

        const deletion = (distances[i - 1]?.[j] ?? 0) + 1;
        const insertion = (distances[i]?.[j - 1] ?? 0) + 1;
        const substitution = (distances[i - 1]?.[j - 1] ?? 0) + cost;

        distances[i]![j] = Math.min(deletion, insertion, substitution);
      }
    }

    return distances[str1.length]?.[str2.length] ?? 0;
  }

  private categoriesMatch(osmCategory: POICategory, googleCategory: POICategory): boolean {
    // Define category compatibility mapping
    const compatibleCategories: Record<POICategory, POICategory[]> = {
      [POICategory.RESTAURANT]: [POICategory.RESTAURANT, POICategory.FAST_FOOD, POICategory.CAFE],
      [POICategory.CAFE]: [POICategory.CAFE, POICategory.RESTAURANT],
      [POICategory.BAR]: [POICategory.BAR, POICategory.PUB, POICategory.NIGHTCLUB],
      // Add more mappings as needed
    } as any;

    const compatible = compatibleCategories[osmCategory];
    return compatible ? compatible.includes(googleCategory) : osmCategory === googleCategory;
  }

  private calculateMergeConfidence(distance: number, nameSimilarity: number, categoryMatch: boolean): number {
    // Weighted confidence calculation
    const distanceScore = Math.max(0, 1 - (distance / 200)); // 200m max distance
    const nameScore = nameSimilarity;
    const categoryScore = categoryMatch ? 1 : 0.3;

    // Weighted average
    return (distanceScore * 0.4 + nameScore * 0.4 + categoryScore * 0.2);
  }

  private calculateQualityScore(place: Place): number {
    let score = 0.5; // Base score

    const metadata = place.metadata;
    if (!metadata) return score;

    // Google rating boost
    if (metadata.google?.rating) {
      score += (metadata.google.rating / 5) * 0.3;
    }

    // Review count boost
    if (metadata.google?.reviewCount) {
      score += Math.min(metadata.google.reviewCount / 100, 0.2);
    }

    // Merged data bonus
    if (metadata.source === 'merged') {
      score += 0.1;
    }

    // OSM data completeness
    if (metadata.osm?.tags && Object.keys(metadata.osm.tags).length > 5) {
      score += 0.1;
    }

    return Math.min(score, 1);
  }

  private async storeMergedResults(places: Place[]): Promise<void> {
    console.log(`💾 Storing ${places.length} merged places in database...`);

    for (const place of places) {
      try {
        await this.storeMergedPlace(place);
      } catch (error) {
        console.warn(`Failed to store place ${place.name}:`, error);
      }
    }
  }

  private async storeMergedPlace(place: Place): Promise<void> {
    const metadata = place.metadata;

    // Guard against undefined metadata
    if (!metadata) {
      console.warn(`Cannot store place ${place.name}: missing metadata`);
      return;
    }

    // Prepare merge status with explicit type checking
    let safeMergeStatus: string | null = null;
    if (metadata.mergeStatus) {
      if (typeof metadata.mergeStatus === 'string') {
        safeMergeStatus = metadata.mergeStatus;
      }
    }

    await db.location.upsertLocation({
      externalId: metadata.externalId,
      source: metadata.source,
      name: place.name,
      latitude: place.coordinates.latitude,
      longitude: place.coordinates.longitude,
      category: place.category,
      address: place.address || null,
      description: place.description || null,
      metadata: metadata,
      // Enhanced fields for multi-provider support - safe access
      osmId: metadata.osm?.id || null,
      googlePlaceId: metadata.google?.placeId || null,
      rating: metadata.google?.rating || null,
      reviewCount: metadata.google?.reviewCount || null,
      priceLevel: metadata.google?.priceLevel || null,
      qualityScore: this.calculateQualityScore(place),
      mergeStatus: safeMergeStatus
    });
  }

  async getPlaceDetails(placeId: string): Promise<Place | null> {
    // Try database first
    const dbPlace = await db.location.findById(placeId);
    if (dbPlace) {
      return this.dbLocationToPlace(dbPlace);
    }

    // Try external providers
    if (placeId.startsWith('google_')) {
      return this.googleProvider?.getPlaceDetails(placeId.replace('google_', '')) || null;
    } else if (placeId.startsWith('osm_')) {
      return this.osmProvider.getPlaceDetails(placeId.replace(/^osm_\w+_/, ''));
    }

    return null;
  }

  private dbLocationToPlace(location: any): Place {
    const place: Place = {
      id: location.id,
      name: location.name,
      category: location.category as POICategory,
      subcategory: location.category,
      coordinates: {
        latitude: location.latitude,
        longitude: location.longitude
      },
      metadata: {
        source: location.source,
        externalId: location.osmId || location.googlePlaceId || location.id,
        lastUpdated: location.lastUpdated || new Date(),
        verified: location.verified ?? false,
        // Safe mergeStatus assignment
        ...(location.mergeStatus && typeof location.mergeStatus === 'string' && { mergeStatus: location.mergeStatus }),
        ...(location.metadata as any)
      }
    };

    // Only add optional properties if they have values
    if (location.address) {
      place.address = location.address;
    }

    if (location.description) {
      place.description = location.description;
    }

    return place;
  }

  validateConfig(): boolean {
    return this.osmProvider.validateConfig();
  }

  getProviderName(): string {
    return 'hybrid';
  }
}