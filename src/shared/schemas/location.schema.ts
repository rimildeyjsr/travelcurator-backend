// src/shared/schemas/location.schema.ts
import { Type, Static } from '@sinclair/typebox';

// Enums for validation
const POICategoryEnum = Type.Union([
  // Food & Dining
  Type.Literal('restaurant'),
  Type.Literal('cafe'),
  Type.Literal('bar'),
  Type.Literal('fast_food'),
  Type.Literal('ice_cream'),
  Type.Literal('marketplace'),

  // Culture & Attractions
  Type.Literal('museum'),
  Type.Literal('gallery'),
  Type.Literal('attraction'),
  Type.Literal('monument'),
  Type.Literal('castle'),
  Type.Literal('theatre'),
  Type.Literal('cinema'),
  Type.Literal('library'),

  // Activities & Recreation
  Type.Literal('park'),
  Type.Literal('fitness_centre'),
  Type.Literal('swimming_pool'),
  Type.Literal('sports_centre'),
  Type.Literal('golf_course'),
  Type.Literal('marina'),
  Type.Literal('beach'),
  Type.Literal('viewpoint'),

  // Wellness & Relaxation
  Type.Literal('spa'),
  Type.Literal('garden'),
  Type.Literal('nature_reserve'),

  // Shopping
  Type.Literal('shop'),
  Type.Literal('mall'),
  Type.Literal('market'),
  Type.Literal('department_store'),

  // Essential Services
  Type.Literal('bank'),
  Type.Literal('atm'),
  Type.Literal('pharmacy'),
  Type.Literal('hospital'),
  Type.Literal('toilets'),
  Type.Literal('fuel'),
  Type.Literal('post_office'),

  // Nightlife
  Type.Literal('pub'),
  Type.Literal('nightclub'),
  Type.Literal('casino'),

  // Transportation
  Type.Literal('bus_station'),
  Type.Literal('subway'),
  Type.Literal('taxi'),
  Type.Literal('car_rental'),
  Type.Literal('parking')
]);

const MoodEnum = Type.Union([
  Type.Literal('energetic'),
  Type.Literal('relaxed'),
  Type.Literal('curious'),
  Type.Literal('hungry'),
  Type.Literal('cultural')
]);

// Core schemas
export const CoordinatesSchema = Type.Object({
  latitude: Type.Number({
    minimum: -90,
    maximum: 90,
    description: 'Latitude coordinate'
  }),
  longitude: Type.Number({
    minimum: -180,
    maximum: 180,
    description: 'Longitude coordinate'
  })
});

export const PlaceMetadataSchema = Type.Object({
  source: Type.Union([
    Type.Literal('osm'),
    Type.Literal('google'),
    Type.Literal('manual')
  ]),
  externalId: Type.String({ description: 'External provider ID' }),
  lastUpdated: Type.String({ format: 'date-time' }),
  verified: Type.Boolean(),
  osm: Type.Optional(Type.Object({
    id: Type.String(),
    type: Type.Union([
      Type.Literal('node'),
      Type.Literal('way'),
      Type.Literal('relation')
    ]),
    tags: Type.Record(Type.String(), Type.String())
  })),
  google: Type.Optional(Type.Object({
    placeId: Type.String(),
    rating: Type.Optional(Type.Number({ minimum: 0, maximum: 5 })),
    reviewCount: Type.Optional(Type.Number({ minimum: 0 })),
    priceLevel: Type.Optional(Type.Number({ minimum: 0, maximum: 4 }))
  })),
  contact: Type.Optional(Type.Object({
    phone: Type.Optional(Type.String()),
    website: Type.Optional(Type.String({ format: 'uri' })),
    email: Type.Optional(Type.String({ format: 'email' }))
  })),
  hours: Type.Optional(Type.Record(Type.String(), Type.String())),
  features: Type.Optional(Type.Array(Type.String()))
});

export const PlaceSchema = Type.Object({
  id: Type.String({ description: 'Unique place identifier' }),
  name: Type.String({ description: 'Name of the place' }),
  category: POICategoryEnum,
  subcategory: Type.String({ description: 'Specific subcategory' }),
  coordinates: CoordinatesSchema,
  distance: Type.Optional(Type.Number({
    minimum: 0,
    description: 'Distance from search center in meters'
  })),
  description: Type.Optional(Type.String({ description: 'Place description' })),
  address: Type.Optional(Type.String({ description: 'Full address' })),
  metadata: PlaceMetadataSchema
});

// Request schemas
export const LocationSearchRequestSchema = Type.Object({
  latitude: Type.Number({
    minimum: -90,
    maximum: 90,
    description: 'Search center latitude'
  }),
  longitude: Type.Number({
    minimum: -180,
    maximum: 180,
    description: 'Search center longitude'
  }),
  radius: Type.Optional(Type.Number({
    minimum: 100,
    maximum: 10000,
    default: 2000,
    description: 'Search radius in meters (100m - 10km)'
  })),
  categories: Type.Optional(Type.Array(POICategoryEnum, {
    description: 'Specific POI categories to search for'
  })),
  mood: Type.Optional(MoodEnum),
  limit: Type.Optional(Type.Number({
    minimum: 1,
    maximum: 50,
    default: 10,
    description: 'Maximum number of results per category'
  })),
  excludeChains: Type.Optional(Type.Boolean({
    default: false,
    description: 'Exclude chain stores and restaurants'
  }))
});

// Response schemas
export const LocationSearchResponseSchema = Type.Object({
  places: Type.Array(PlaceSchema),
  metadata: Type.Object({
    provider: Type.String({ description: 'Data provider used' }),
    responseTime: Type.Number({ description: 'Response time in milliseconds' }),
    totalResults: Type.Number({ description: 'Total number of results found' }),
    searchRadius: Type.Number({ description: 'Actual search radius used' }),
    categoriesSearched: Type.Array(Type.String()),
    cached: Type.Optional(Type.Boolean({ description: 'Whether result was cached' }))
  })
});

export const PlaceDetailsResponseSchema = Type.Object({
  place: PlaceSchema,
  metadata: Type.Object({
    provider: Type.String(),
    lastUpdated: Type.String({ format: 'date-time' }),
    verified: Type.Boolean()
  })
});

// Enhanced search schemas for AI integration
export const AILocationRequestSchema = Type.Object({
  latitude: Type.Number({ minimum: -90, maximum: 90 }),
  longitude: Type.Number({ minimum: -180, maximum: 180 }),
  mood: MoodEnum,
  preferences: Type.Optional(Type.Array(Type.String())),
  budget: Type.Optional(Type.Union([
    Type.Literal('low'),
    Type.Literal('medium'),
    Type.Literal('high')
  ])),
  timeOfDay: Type.Optional(Type.Union([
    Type.Literal('morning'),
    Type.Literal('afternoon'),
    Type.Literal('evening'),
    Type.Literal('night')
  ])),
  duration: Type.Optional(Type.Number({ minimum: 0.5, maximum: 24 })),
  radius: Type.Optional(Type.Number({ minimum: 100, maximum: 10000, default: 2000 }))
});

export const AILocationResponseSchema = Type.Object({
  places: Type.Array(PlaceSchema),
  aiRecommendations: Type.Array(Type.Object({
    place: PlaceSchema,
    reasoning: Type.String({ description: 'AI reasoning for recommendation' }),
    moodMatch: Type.Number({
      minimum: 0,
      maximum: 1,
      description: 'How well this matches the requested mood (0-1)'
    }),
    estimatedDuration: Type.Optional(Type.String()),
    priceRange: Type.Optional(Type.String())
  })),
  metadata: Type.Object({
    aiProvider: Type.String(),
    locationProvider: Type.String(),
    responseTime: Type.Number(),
    aiCost: Type.Optional(Type.Number()),
    placesFound: Type.Number(),
    recommendationsGenerated: Type.Number()
  })
});

// Type exports
export type LocationSearchRequest = Static<typeof LocationSearchRequestSchema>;
export type LocationSearchResponse = Static<typeof LocationSearchResponseSchema>;
export type PlaceDetailsResponse = Static<typeof PlaceDetailsResponseSchema>;
export type Place = Static<typeof PlaceSchema>;
export type PlaceMetadata = Static<typeof PlaceMetadataSchema>;
export type Coordinates = Static<typeof CoordinatesSchema>;
export type AILocationRequest = Static<typeof AILocationRequestSchema>;
export type AILocationResponse = Static<typeof AILocationResponseSchema>;