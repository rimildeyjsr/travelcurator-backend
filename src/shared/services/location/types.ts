export interface LocationSearchRequest {
  latitude: number;
  longitude: number;
  radius?: number; // meters, default 2000 (2km)
  categories?: POICategory[];
  mood?: 'energetic' | 'relaxed' | 'curious' | 'hungry' | 'cultural';
  limit?: number; // max results per category, default 10
  excludeChains?: boolean; // exclude chain stores/restaurants
}

export interface LocationSearchResponse {
  places: Place[];
  metadata: {
    provider: string;
    responseTime: number;
    totalResults: number;
    searchRadius: number;
    categoriesSearched: string[];
    cached?: boolean;
  };
}

export interface Place {
  id: string;
  name: string;
  category: POICategory;
  subcategory: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  distance?: number | null; // meters from search center
  description?: string | null; // Made optional
  address?: string | null; // Made optional
  metadata?: PlaceMetadata;
}

export interface PlaceMetadata {
  source: 'osm' | 'google' | 'manual';
  externalId: string;
  lastUpdated: Date;
  verified: boolean;

  // OSM-specific data
  osm?: {
    id: string;
    type: 'node' | 'way' | 'relation';
    tags: Record<string, string>;
  };

  // Google Places data (future)
  google?: {
    placeId: string;
    rating?: number;
    reviewCount?: number;
    priceLevel?: number;
  };

  // General place information
  contact?: {
    phone?: string;
    website?: string;
    email?: string;
  };

  hours?: {
    [day: string]: string; // "09:00-17:00" or "closed"
  };

  features?: string[]; // ["wifi", "wheelchair_accessible", "outdoor_seating"]

  // AI enhancement data
  aiContext?: {
    moodRelevance: Record<string, number>; // mood -> relevance score 0-1
    seasonality?: string; // "winter", "summer", "year-round"
    crowdLevel?: 'low' | 'medium' | 'high';
  };
}

export enum POICategory {
  // Food & Dining
  RESTAURANT = 'restaurant',
  CAFE = 'cafe',
  BAR = 'bar',
  FAST_FOOD = 'fast_food',
  ICE_CREAM = 'ice_cream',
  MARKETPLACE = 'marketplace',

  // Culture & Attractions
  MUSEUM = 'museum',
  GALLERY = 'gallery',
  ATTRACTION = 'attraction',
  MONUMENT = 'monument',
  CASTLE = 'castle',
  THEATRE = 'theatre',
  CINEMA = 'cinema',
  LIBRARY = 'library',

  // Activities & Recreation
  PARK = 'park',
  FITNESS_CENTRE = 'fitness_centre',
  SWIMMING_POOL = 'swimming_pool',
  SPORTS_CENTRE = 'sports_centre',
  GOLF_COURSE = 'golf_course',
  MARINA = 'marina',
  BEACH = 'beach',
  VIEWPOINT = 'viewpoint',

  // Wellness & Relaxation
  SPA = 'spa',
  GARDEN = 'garden',
  NATURE_RESERVE = 'nature_reserve',

  // Shopping
  SHOP = 'shop',
  MALL = 'mall',
  MARKET = 'market',
  DEPARTMENT_STORE = 'department_store',

  // Essential Services
  BANK = 'bank',
  ATM = 'atm',
  PHARMACY = 'pharmacy',
  HOSPITAL = 'hospital',
  TOILETS = 'toilets',
  FUEL = 'fuel',
  POST_OFFICE = 'post_office',

  // Nightlife
  PUB = 'pub',
  NIGHTCLUB = 'nightclub',
  CASINO = 'casino',

  // Transportation
  BUS_STATION = 'bus_station',
  SUBWAY = 'subway',
  TAXI = 'taxi',
  CAR_RENTAL = 'car_rental',
  PARKING = 'parking'
}

export const POI_CATEGORY_MAPPING = {
  // Food & Dining
  [POICategory.RESTAURANT]: ['amenity=restaurant'],
  [POICategory.CAFE]: ['amenity=cafe'],
  [POICategory.BAR]: ['amenity=bar'],
  [POICategory.FAST_FOOD]: ['amenity=fast_food'],
  [POICategory.ICE_CREAM]: ['amenity=ice_cream'],
  [POICategory.MARKETPLACE]: ['amenity=marketplace'],

  // Culture & Attractions
  [POICategory.MUSEUM]: ['tourism=museum'],
  [POICategory.GALLERY]: ['tourism=gallery'],
  [POICategory.ATTRACTION]: ['tourism=attraction'],
  [POICategory.MONUMENT]: ['historic=monument'],
  [POICategory.CASTLE]: ['historic=castle'],
  [POICategory.THEATRE]: ['amenity=theatre'],
  [POICategory.CINEMA]: ['amenity=cinema'],
  [POICategory.LIBRARY]: ['amenity=library'],

  // Activities & Recreation
  [POICategory.PARK]: ['leisure=park'],
  [POICategory.FITNESS_CENTRE]: ['leisure=fitness_centre'],
  [POICategory.SWIMMING_POOL]: ['leisure=swimming_pool'],
  [POICategory.SPORTS_CENTRE]: ['leisure=sports_centre'],
  [POICategory.GOLF_COURSE]: ['leisure=golf_course'],
  [POICategory.MARINA]: ['leisure=marina'],
  [POICategory.BEACH]: ['natural=beach'],
  [POICategory.VIEWPOINT]: ['tourism=viewpoint'],

  // Wellness & Relaxation
  [POICategory.SPA]: ['leisure=spa'],
  [POICategory.GARDEN]: ['leisure=garden'],
  [POICategory.NATURE_RESERVE]: ['leisure=nature_reserve'],

  // Shopping
  [POICategory.SHOP]: ['shop=clothes', 'shop=books', 'shop=electronics', 'shop=jewelry'],
  [POICategory.MALL]: ['shop=mall'],
  [POICategory.MARKET]: ['amenity=marketplace'],
  [POICategory.DEPARTMENT_STORE]: ['shop=department_store'],

  // Essential Services
  [POICategory.BANK]: ['amenity=bank'],
  [POICategory.ATM]: ['amenity=atm'],
  [POICategory.PHARMACY]: ['amenity=pharmacy'],
  [POICategory.HOSPITAL]: ['amenity=hospital'],
  [POICategory.TOILETS]: ['amenity=toilets'],
  [POICategory.FUEL]: ['amenity=fuel'],
  [POICategory.POST_OFFICE]: ['amenity=post_office'],

  // Nightlife
  [POICategory.PUB]: ['amenity=pub'],
  [POICategory.NIGHTCLUB]: ['amenity=nightclub'],
  [POICategory.CASINO]: ['amenity=casino'],

  // Transportation
  [POICategory.BUS_STATION]: ['amenity=bus_station'],
  [POICategory.SUBWAY]: ['railway=subway_entrance'],
  [POICategory.TAXI]: ['amenity=taxi'],
  [POICategory.CAR_RENTAL]: ['amenity=car_rental'],
  [POICategory.PARKING]: ['amenity=parking']
} as const;

export const MOOD_CATEGORY_MAPPING = {
  energetic: [
    POICategory.PARK, POICategory.FITNESS_CENTRE, POICategory.SWIMMING_POOL,
    POICategory.SPORTS_CENTRE, POICategory.BEACH, POICategory.VIEWPOINT,
    POICategory.RESTAURANT, POICategory.CAFE, POICategory.ATM, POICategory.TOILETS
  ] as POICategory[],
  relaxed: [
    POICategory.SPA, POICategory.PARK, POICategory.GARDEN, POICategory.NATURE_RESERVE,
    POICategory.CAFE, POICategory.LIBRARY, POICategory.BEACH,
    POICategory.PHARMACY, POICategory.TOILETS
  ] as POICategory[],
  curious: [
    POICategory.MUSEUM, POICategory.GALLERY, POICategory.ATTRACTION, POICategory.MONUMENT,
    POICategory.CASTLE, POICategory.LIBRARY, POICategory.VIEWPOINT,
    POICategory.CAFE, POICategory.RESTAURANT, POICategory.ATM, POICategory.TOILETS
  ] as POICategory[],
  hungry: [
    POICategory.RESTAURANT, POICategory.CAFE, POICategory.FAST_FOOD, POICategory.ICE_CREAM,
    POICategory.MARKETPLACE, POICategory.MARKET,
    POICategory.ATM, POICategory.TOILETS
  ] as POICategory[],
  cultural: [
    POICategory.MUSEUM, POICategory.GALLERY, POICategory.THEATRE, POICategory.CINEMA,
    POICategory.MONUMENT, POICategory.CASTLE, POICategory.LIBRARY,
    POICategory.RESTAURANT, POICategory.CAFE, POICategory.SHOP,
    POICategory.ATM, POICategory.TOILETS
  ] as POICategory[]
};

export interface LocationProvider {
  searchNearby(request: LocationSearchRequest): Promise<LocationSearchResponse>;
  getPlaceDetails(externalId: string): Promise<Place | null>;
  validateConfig(): boolean;
  getProviderName(): string;
}

export interface LocationProviderConfig {
  osm?: {
    endpoint: string;
    timeout: number;
    userAgent: string;
  };
  google?: {
    apiKey: string;
    timeout: number;
  };
}

export interface LocationServiceConfig {
  primaryProvider: 'osm' | 'google';
  fallbackProvider?: 'osm' | 'google';
  enableCaching: boolean;
  cacheTimeout: number; // seconds
  defaultRadius: number; // meters
  maxRadius: number; // meters
  resultsPerCategory: number;
}