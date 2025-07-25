import { Type, Static } from '@sinclair/typebox';

export const RecommendationRequestSchema = Type.Object({
  latitude: Type.Number({
    minimum: -90,
    maximum: 90,
    description: 'Latitude coordinate'
  }),
  longitude: Type.Number({
    minimum: -180,
    maximum: 180,
    description: 'Longitude coordinate'
  }),
  mood: Type.Union([
    Type.Literal('energetic'),
    Type.Literal('relaxed'),
    Type.Literal('curious'),
    Type.Literal('hungry'),
    Type.Literal('cultural')
  ], { description: 'Current mood for recommendations' }),
  preferences: Type.Optional(Type.Array(Type.String(), {
    description: 'User preferences (e.g., "museums", "outdoor activities")'
  })),
  budget: Type.Optional(Type.Union([
    Type.Literal('low'),
    Type.Literal('medium'),
    Type.Literal('high')
  ], { description: 'Budget level' })),
  timeOfDay: Type.Optional(Type.Union([
    Type.Literal('morning'),
    Type.Literal('afternoon'),
    Type.Literal('evening'),
    Type.Literal('night')
  ], { description: 'Time of day' })),
  duration: Type.Optional(Type.Number({
    minimum: 0.5,
    maximum: 24,
    description: 'Available hours'
  }))
});

export const RecommendationSchema = Type.Object({
  name: Type.String({ description: 'Name of the place or activity' }),
  category: Type.String({ description: 'Category (restaurant, attraction, etc.)' }),
  description: Type.String({ description: 'Description of the recommendation' }),
  reasoning: Type.String({ description: 'Why this was recommended' }),
  estimatedDuration: Type.Optional(Type.String({ description: 'Estimated time needed' })),
  priceRange: Type.Optional(Type.String({ description: 'Price range indicator' })),
  coordinates: Type.Optional(Type.Object({
    latitude: Type.Number(),
    longitude: Type.Number()
  }))
});

export const RecommendationResponseSchema = Type.Object({
  recommendations: Type.Array(RecommendationSchema),
  metadata: Type.Object({
    provider: Type.String({ description: 'AI provider used' }),
    model: Type.String({ description: 'AI model used' }),
    responseTime: Type.Number({ description: 'Response time in milliseconds' }),
    cached: Type.Optional(Type.Boolean({ description: 'Whether result was cached' })),
    tokensUsed: Type.Optional(Type.Number({ description: 'Tokens consumed' })),
    cost: Type.Optional(Type.Number({ description: 'Estimated cost in USD' }))
  })
});

// TypeScript types
export type RecommendationRequest = Static<typeof RecommendationRequestSchema>;
export type Recommendation = Static<typeof RecommendationSchema>;
export type RecommendationResponse = Static<typeof RecommendationResponseSchema>;