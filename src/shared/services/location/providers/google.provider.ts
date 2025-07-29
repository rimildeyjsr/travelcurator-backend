// src/shared/services/location/providers/google.provider.ts

import { PlacesApi, PlaceData, FieldMask } from '@googlemaps/places';
import { config } from '@shared/config';
import {
  LocationProvider,
  LocationSearchRequest,
  LocationSearchResponse,
  Place,
  POICategory,
  PlaceMetadata
} from '../types';

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  priceLevel?: 'PRICE_LEVEL_FREE' | 'PRICE_LEVEL_INEXPENSIVE' | 'PRICE_LEVEL_MODERATE' | 'PRICE_LEVEL_EXPENSIVE' | 'PRICE_LEVEL_VERY_EXPENSIVE';
  businessStatus?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
  photos?: Array<{
    name: string;
    widthPx: number;
    heightPx: number;
  }>;
  regularOpeningHours?: {
    periods: Array<{
      open: { day: number; hour: number; minute: number };
      close?: { day: number; hour: number; minute: number };
    }>;
  };
  nationalPhoneNumber?: string;
  websiteUri?: string;
}

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
  marina: POICategory.MARINA,

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
  car_rental: POICategory.CAR_RENTAL,
  parking: POICategory.PARKING,
};

export class GooglePlacesProvider implements LocationProvider {
  private client: PlacesApi;
  private apiKey: string;

  constructor() {
    if (!config.apis.googlePlaces) {
      throw new Error('GOOGLE_PLACES_API_KEY is required but not configured');
    }

    this.apiKey = config.apis.googlePlaces;
    this.client = new PlacesApi({
      apiKey: this.apiKey,
    });
  }

  async searchNearby(request: LocationSearchRequest): Promise<LocationSearchResponse> {
    const startTime = Date.now();

    try {
      // Use Google's Nearby Search API
      const response = await this.client.searchNearby({
        // Request body
        requestBody: {
          includedTypes: this.mapCategoriesToGoogleTypes(request.categories || []),
          maxResultCount: request.limit || 20,
          locationRestriction: {
            circle: {
              center: {
                latitude: request.latitude,
                longitude: request.longitude,
              },
              radius: request.radius || 2000,
            },
          },
          // Only request the fields we need to minimize cost
          fieldMask: [
            'places.id',
            'places.displayName',
            'places.formattedAddress',
            'places.location',
            'places.types',
            'places.rating',
            'places.userRatingCount',
            'places.priceLevel',
            'places.businessStatus',
          ].join(',') as FieldMask,
        },
      });

      const places = this.parseGooglePlaces(
        response.data.places || [],
        request.latitude,
        request.longitude
      );

      return {
        places,
        metadata: {
          provider: 'google',
          responseTime: Date.now() - startTime,
          totalResults: places.length,
          searchRadius: request.radius || 2000,
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
      const response = await this.client.getPlace({
        name: `places/${placeId}`,
        fieldMask: [
          'id',
          'displayName',
          'formattedAddress',
          'location',
          'types',
          'rating',
          'userRatingCount',
          'priceLevel',
          'businessStatus',
          'photos',
          'regularOpeningHours',
          'nationalPhoneNumber',
          'websiteUri',
        ].join(',') as FieldMask,
      });

      const googlePlace = response.data as GooglePlace;
      if (!googlePlace.location) {
        return null;
      }

      return this.googlePlaceToPlace(googlePlace, 0);
    } catch (error) {
      console.warn(`Failed to get Google place details for ${placeId}:`, error);
      return null;
    }
  }

  private mapCategoriesToGoogleTypes(categories: POICategory[]): string[] {
    const googleTypes: string[] = [];

    // Create reverse mapping
    const categoryToGoogleTypes: Record<POICategory, string[]> = {
      [POICategory.RESTAURANT]: ['restaurant', 'meal_takeaway'],
      [POICategory.CAFE]: ['cafe'],
      [POICategory.BAR]: ['bar'],
      [POICategory.FAST_FOOD]: ['meal_takeaway', 'meal_delivery'],
      [POICategory.MUSEUM]: ['museum'],
      [POICategory.GALLERY]: ['art_gallery'],
      [POICategory.ATTRACTION]: ['tourist_attraction', 'amusement_park', 'zoo'],
      [POICategory.PARK]: ['park'],
      [POICategory.FITNESS_CENTRE]: ['gym'],
      [POICategory.SPA]: ['spa'],
      [POICategory.SHOP]: ['clothing_store', 'book_store', 'electronics_store'],
      [POICategory.MALL]: ['shopping_mall'],
      [POICategory.BANK]: ['bank'],
      [POICategory.ATM]: ['atm'],
      [POICategory.PHARMACY]: ['pharmacy'],
      [POICategory.HOSPITAL]: ['hospital'],
      [POICategory.FUEL]: ['gas_station'],
      // Add more mappings as needed
    } as Record<POICategory, string[]>;

    for (const category of categories) {
      const types = categoryToGoogleTypes[category];
      if (types) {
        googleTypes.push(...types);
      }
    }

    return googleTypes.length > 0 ? googleTypes : ['point_of_interest'];
  }

  private parseGooglePlaces(places: GooglePlace[], searchLat: number, searchLng: number): Place[] {
    return places
      .filter((place): place is GooglePlace & { location: NonNullable<GooglePlace['location']> } =>
        !!(place.location && place.displayName?.text)
      )
      .map(place => {
        const distance = this.calculateDistance(
          searchLat,
          searchLng,
          place.location.latitude,
          place.location.longitude
        );
        return this.googlePlaceToPlace(place, distance);
      })
      .filter((place): place is Place => place !== null)
      .sort((a, b) => (a.distance || 0) - (b.distance || 0));
  }

  private googlePlaceToPlace(googlePlace: GooglePlace, distance: number): Place | null {
    if (!googlePlace.location || !googlePlace.displayName?.text) {
      return null;
    }

    const category = this.categorizeGooglePlace(googlePlace);
    const subcategory = googlePlace.types?.[0] || 'unknown';

    // Build contact info
    const contact: PlaceMetadata['contact'] = {};
    if (googlePlace.nationalPhoneNumber) contact.phone = googlePlace.nationalPhoneNumber;
    if (googlePlace.websiteUri) contact.website = googlePlace.websiteUri;

    // Build hours
    const hours: Record<string, string> = {};
    if (googlePlace.regularOpeningHours?.periods) {
      // Convert Google's complex opening hours to simple format
      const periods = googlePlace.regularOpeningHours.periods;
      for (const period of periods) {
        const dayName = this.getDayName(period.open.day);
        const openTime = `${period.open.hour.toString().padStart(2, '0')}:${period.open.minute.toString().padStart(2, '0')}`;
        const closeTime = period.close
          ? `${period.close.hour.toString().padStart(2, '0')}:${period.close.minute.toString().padStart(2, '0')}`
          : '23:59';
        hours[dayName] = `${openTime}-${closeTime}`;
      }
    }

    // Build features
    const features: string[] = [];
    if (googlePlace.businessStatus === 'OPERATIONAL') features.push('operational');

    const place: Place = {
      id: `google_${googlePlace.id}`,
      name: googlePlace.displayName.text,
      category,
      subcategory,
      coordinates: {
        latitude: googlePlace.location.latitude,
        longitude: googlePlace.location.longitude,
      },
      distance,
      metadata: {
        source: 'google' as const,
        externalId: googlePlace.id,
        lastUpdated: new Date(),
        verified: true,
        google: {
          placeId: googlePlace.id,
          ...(googlePlace.rating && { rating: googlePlace.rating }),
          ...(googlePlace.userRatingCount && { reviewCount: googlePlace.userRatingCount }),
          ...(googlePlace.priceLevel && { priceLevel: this.mapPriceLevel(googlePlace.priceLevel) }),
        },
        ...(Object.keys(contact).length > 0 && { contact }),
        ...(Object.keys(hours).length > 0 && { hours }),
        ...(features.length > 0 && { features }),
      },
    };

    // Add optional properties only if they exist
    if (googlePlace.formattedAddress) {
      place.address = googlePlace.formattedAddress;
    }

    return place;
  }

  private categorizeGooglePlace(place: GooglePlace): POICategory {
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

  private mapPriceLevel(priceLevel: string): number {
    const mapping: Record<string, number> = {
      'PRICE_LEVEL_FREE': 0,
      'PRICE_LEVEL_INEXPENSIVE': 1,
      'PRICE_LEVEL_MODERATE': 2,
      'PRICE_LEVEL_EXPENSIVE': 3,
      'PRICE_LEVEL_VERY_EXPENSIVE': 4,
    };
    return mapping[priceLevel] || 2;
  }

  private getDayName(dayNumber: number): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[dayNumber] || 'unknown';
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