// src/shared/services/location/providers/google.provider.ts - WORKING VERSION with Legacy API

import { config } from '@shared/config';
import {
  LocationProvider,
  LocationSearchRequest,
  LocationSearchResponse,
  Place,
  POICategory,
  PlaceMetadata
} from '../types';

// Google Place Types to POI Category mapping
const GOOGLE_TYPE_TO_CATEGORY: Record<string, POICategory> = {
  // Food & Dining
  restaurant: POICategory.RESTAURANT,
  meal_takeaway: POICategory.FAST_FOOD,
  meal_delivery: POICategory.FAST_FOOD,
  cafe: POICategory.CAFE,
  bar: POICategory.BAR,
  night_club: POICategory.NIGHTCLUB,

  // Culture & Attractions
  museum: POICategory.MUSEUM,
  art_gallery: POICategory.GALLERY,
  tourist_attraction: POICategory.ATTRACTION,
  amusement_park: POICategory.ATTRACTION,
  zoo: POICategory.ATTRACTION,
  movie_theater: POICategory.CINEMA,
  library: POICategory.LIBRARY,

  // Activities & Recreation
  park: POICategory.PARK,
  gym: POICategory.FITNESS_CENTRE,
  spa: POICategory.SPA,
  golf_course: POICategory.GOLF_COURSE,

  // Shopping
  shopping_mall: POICategory.MALL,
  department_store: POICategory.DEPARTMENT_STORE,
  clothing_store: POICategory.SHOP,
  book_store: POICategory.SHOP,
  electronics_store: POICategory.SHOP,

  // Essential Services
  bank: POICategory.BANK,
  atm: POICategory.ATM,
  pharmacy: POICategory.PHARMACY,
  hospital: POICategory.HOSPITAL,
  gas_station: POICategory.FUEL,
  post_office: POICategory.POST_OFFICE,

  // Transportation
  bus_station: POICategory.BUS_STATION,
  subway_station: POICategory.SUBWAY,
  taxi_stand: POICategory.TAXI,
  parking: POICategory.PARKING,
};

export class GooglePlacesProvider implements LocationProvider {
  private apiKey: string;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/place';
  private readonly timeout: number;

  constructor() {
    if (!config.apis.googlePlaces) {
      throw new Error('GOOGLE_PLACES_API_KEY is required but not configured');
    }

    this.apiKey = config.apis.googlePlaces;
    this.timeout = config.location?.timeout || 10000;
  }

  async searchNearby(request: LocationSearchRequest): Promise<LocationSearchResponse> {
    const startTime = Date.now();

    try {
      // Use Google Places API (Legacy) - simple and reliable
      const location = `${request.latitude},${request.longitude}`;
      const radius = request.radius || 2000;
      const type = this.mapCategoriesToGoogleType(request.categories || []);

      const params = new URLSearchParams({
        location,
        radius: radius.toString(),
        key: this.apiKey,
        ...(type && { type }),
      });

      const url = `${this.baseUrl}/nearbysearch/json?${params}`;

      console.log('🔍 Google Places API (Legacy) Request:', url.replace(this.apiKey, '[REDACTED]'));

      const response = await this.makeRequest(url);

      if (response.status !== 'OK' && response.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places API error: ${response.status} - ${response.error_message || 'Unknown error'}`);
      }

      const places = this.parseGooglePlaces(
        response.results || [],
        request.latitude,
        request.longitude
      );

      console.log('✅ Google Places API Success:', `Found ${places.length} places`);

      return {
        places,
        metadata: {
          provider: 'google',
          responseTime: Date.now() - startTime,
          totalResults: places.length,
          searchRadius: radius,
          categoriesSearched: request.categories?.map(cat => cat.toString()) || [],
          cached: false,
        },
      };
    } catch (error) {
      throw new Error(`Google Places search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPlaceDetails(placeId: string): Promise<Place | null> {
    try {
      const params = new URLSearchParams({
        place_id: placeId,
        key: this.apiKey,
        fields: 'place_id,name,formatted_address,geometry,types,rating,user_ratings_total,price_level,business_status,formatted_phone_number,website,opening_hours'
      });

      const url = `${this.baseUrl}/details/json?${params}`;
      const response = await this.makeRequest(url);

      if (response.status !== 'OK') {
        console.warn(`Failed to get Google place details for ${placeId}: ${response.status}`);
        return null;
      }

      if (!response.result || !response.result.geometry?.location) {
        return null;
      }

      return this.googlePlaceToPlace(response.result, 0);
    } catch (error) {
      console.warn(`Failed to get Google place details for ${placeId}:`, error);
      return null;
    }
  }

  private async makeRequest(url: string): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }

      throw error;
    }
  }

  private mapCategoriesToGoogleType(categories: POICategory[]): string | undefined {
    // For legacy API, we can only specify one type, so pick the first one
    if (categories.length === 0) return undefined;

    const firstCategory = categories[0];
    if (!firstCategory) return undefined;

    const categoryToGoogleType: Record<POICategory, string> = {
      [POICategory.RESTAURANT]: 'restaurant',
      [POICategory.CAFE]: 'cafe',
      [POICategory.BAR]: 'bar',
      [POICategory.FAST_FOOD]: 'meal_takeaway',
      [POICategory.MUSEUM]: 'museum',
      [POICategory.GALLERY]: 'art_gallery',
      [POICategory.ATTRACTION]: 'tourist_attraction',
      [POICategory.PARK]: 'park',
      [POICategory.FITNESS_CENTRE]: 'gym',
      [POICategory.SPA]: 'spa',
      [POICategory.SHOP]: 'store',
      [POICategory.MALL]: 'shopping_mall',
      [POICategory.BANK]: 'bank',
      [POICategory.ATM]: 'atm',
      [POICategory.PHARMACY]: 'pharmacy',
      [POICategory.HOSPITAL]: 'hospital',
      [POICategory.FUEL]: 'gas_station',
    } as Record<POICategory, string>;

    return categoryToGoogleType[firstCategory] || 'point_of_interest';
  }

  private parseGooglePlaces(places: any[], searchLat: number, searchLng: number): Place[] {
    return places
      .filter(place => place.geometry?.location && place.name)
      .map(place => {
        const distance = this.calculateDistance(
          searchLat,
          searchLng,
          place.geometry.location.lat,
          place.geometry.location.lng
        );
        return this.googlePlaceToPlace(place, distance);
      })
      .filter((place): place is Place => place !== null)
      .sort((a, b) => (a.distance || 0) - (b.distance || 0));
  }

  private googlePlaceToPlace(googlePlace: any, distance: number): Place | null {
    if (!googlePlace.geometry?.location || !googlePlace.name) {
      return null;
    }

    const category = this.categorizeGooglePlace(googlePlace);
    const subcategory = googlePlace.types?.[0] || 'unknown';

    // Build contact info - only include if values exist
    const contact: { phone?: string; website?: string; email?: string } = {};
    if (googlePlace.formatted_phone_number) contact.phone = googlePlace.formatted_phone_number;
    if (googlePlace.website) contact.website = googlePlace.website;

    // Build hours - only include if values exist
    const hours: Record<string, string> = {};
    if (googlePlace.opening_hours?.weekday_text) {
      googlePlace.opening_hours.weekday_text.forEach((dayText: string) => {
        const [day, time] = dayText.split(': ');
        if (day && time) {
          hours[day.toLowerCase()] = time;
        }
      });
    }

    // Build features
    const features: string[] = [];
    if (googlePlace.business_status === 'OPERATIONAL') features.push('operational');

    // Build metadata step by step to avoid undefined assignments
    const googleMetadata: { placeId: string; rating?: number; reviewCount?: number; priceLevel?: number } = {
      placeId: googlePlace.place_id,
    };

    if (typeof googlePlace.rating === 'number') {
      googleMetadata.rating = googlePlace.rating;
    }
    if (typeof googlePlace.user_ratings_total === 'number') {
      googleMetadata.reviewCount = googlePlace.user_ratings_total;
    }
    if (typeof googlePlace.price_level === 'number') {
      googleMetadata.priceLevel = googlePlace.price_level;
    }

    const metadata: PlaceMetadata = {
      source: 'google' as const,
      externalId: googlePlace.place_id,
      lastUpdated: new Date(),
      verified: true,
      google: googleMetadata,
    };

    if (Object.keys(contact).length > 0) {
      metadata.contact = contact;
    }
    if (Object.keys(hours).length > 0) {
      metadata.hours = hours;
    }
    if (features.length > 0) {
      metadata.features = features;
    }

    const place: Place = {
      id: `google_${googlePlace.place_id}`,
      name: googlePlace.name,
      category,
      subcategory,
      coordinates: {
        latitude: googlePlace.geometry.location.lat,
        longitude: googlePlace.geometry.location.lng,
      },
      metadata,
    };

    // Only add distance if it's a valid number
    if (typeof distance === 'number' && !isNaN(distance)) {
      place.distance = distance;
    }

    // Add optional properties only if they exist
    if (googlePlace.formatted_address) {
      place.address = googlePlace.formatted_address;
    }

    return place;
  }

  private categorizeGooglePlace(place: any): POICategory {
    if (!place.types) {
      return POICategory.ATTRACTION;
    }

    // Find the most specific category match
    for (const type of place.types) {
      const category = GOOGLE_TYPE_TO_CATEGORY[type];
      if (category) {
        return category;
      }
    }

    // Fallback categorization
    return POICategory.ATTRACTION;
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    // Haversine formula
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

  validateConfig(): boolean {
    return !!this.apiKey;
  }

  getProviderName(): string {
    return 'google';
  }
}