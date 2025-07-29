import { PrismaClient } from '@prisma/client';

export interface LocationSearchParams {
  latitude: number;
  longitude: number;
  radius: number; // meters
  categories?: string[];
  limit?: number;
  source?: string;
}

export interface NearbyLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  category: string;
  createdAt: Date;
  source: string;
  osmId: string | null;
  googlePlaceId: string | null;
  osmLastUpdated: Date | null;
  googleLastUpdated: Date | null;
  lastUpdated: Date | null;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: number | null;
  qualityScore: number | null;
  mergeStatus: string | null;
  verified: boolean;
  address: string | null;
  description: string | null;
  metadata: any;
  distance: number;
}

// Enhanced interface for multi-provider location creation
export interface CreateLocationData {
  externalId: string;
  source: string;
  name: string;
  latitude: number;
  longitude: number;
  category: string;
  address?: string | null;
  description?: string | null;
  metadata?: any;
  // Enhanced multi-provider fields
  osmId?: string | null;
  googlePlaceId?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  priceLevel?: number | null;
  qualityScore?: number | null;
  mergeStatus?: string | null; // Allow null explicitly
}

export class LocationRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: any) {
    return this.prisma.location.create({ data });
  }

  async findById(id: string) {
    return this.prisma.location.findUnique({ where: { id } });
  }

  // Enhanced find methods for multi-provider support
  async findByOsmId(osmId: string) {
    return this.prisma.location.findFirst({
      where: { osmId }
    });
  }

  async findByGooglePlaceId(googlePlaceId: string) {
    return this.prisma.location.findFirst({
      where: { googlePlaceId }
    });
  }

  async findByExternalId(externalId: string, source: string) {
    return this.prisma.location.findFirst({
      where: {
        OR: [
          { osmId: externalId, source: 'osm' },
          { googlePlaceId: externalId, source: 'google' },
          { osmId: externalId, source: 'merged' },
          { googlePlaceId: externalId, source: 'merged' }
        ]
      }
    });
  }

  async findNearby(params: LocationSearchParams): Promise<NearbyLocation[]> {
    const { latitude, longitude, radius, categories, limit = 50, source } = params;

    // Calculate bounding box for efficient initial filtering
    const boundingBox = this.calculateBoundingBox(latitude, longitude, radius);

    const whereClause: any = {
      latitude: {
        gte: boundingBox.minLat,
        lte: boundingBox.maxLat
      },
      longitude: {
        gte: boundingBox.minLng,
        lte: boundingBox.maxLng
      }
    };

    if (categories && categories.length > 0) {
      whereClause.category = { in: categories };
    }

    if (source) {
      whereClause.source = source;
    }

    const locations = await this.prisma.location.findMany({
      where: whereClause,
      take: limit * 2, // Get more than needed for distance filtering
      orderBy: [
        { qualityScore: 'desc' },
        { rating: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    // Calculate exact distances and filter
    const locationsWithDistance = locations
      .map((location: any) => ({
        ...location,
        distance: this.calculateDistance(
          latitude, longitude,
          location.latitude, location.longitude
        )
      }))
      .filter((location: any) => location.distance <= radius)
      .sort((a: any, b: any) => a.distance - b.distance)
      .slice(0, limit);

    return locationsWithDistance;
  }

  // Enhanced upsert method for multi-provider data
  async upsertLocation(data: CreateLocationData) {
    // Try to find existing location by provider-specific IDs
    let existing = null;

    if (data.osmId) {
      existing = await this.findByOsmId(data.osmId);
    }

    if (!existing && data.googlePlaceId) {
      existing = await this.findByGooglePlaceId(data.googlePlaceId);
    }

    if (existing) {
      // Update existing location with new/merged data
      return this.prisma.location.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          latitude: data.latitude,
          longitude: data.longitude,
          category: data.category,
          address: data.address || null,
          description: data.description || null,
          metadata: data.metadata,
          source: data.source,

          // Update provider-specific fields only if provided
          ...(data.osmId && {
            osmId: data.osmId,
            osmLastUpdated: new Date()
          }),
          ...(data.googlePlaceId && {
            googlePlaceId: data.googlePlaceId,
            googleLastUpdated: new Date()
          }),
          ...(data.rating !== undefined && { rating: data.rating }),
          ...(data.reviewCount !== undefined && { reviewCount: data.reviewCount }),
          ...(data.priceLevel !== undefined && { priceLevel: data.priceLevel }),
          ...(data.qualityScore !== undefined && { qualityScore: data.qualityScore }),
          ...(data.mergeStatus && { mergeStatus: data.mergeStatus }),

          lastUpdated: new Date(),
          verified: true
        }
      });
    } else {
      // Create new location
      return this.prisma.location.create({
        data: {
          name: data.name,
          latitude: data.latitude,
          longitude: data.longitude,
          category: data.category,
          address: data.address || null,
          description: data.description || null,
          metadata: data.metadata,
          source: data.source,
          osmId: data.osmId || null,
          googlePlaceId: data.googlePlaceId || null,
          rating: data.rating || null,
          reviewCount: data.reviewCount || null,
          priceLevel: data.priceLevel || null,
          qualityScore: data.qualityScore || null,
          mergeStatus: data.mergeStatus || 'pending',
          verified: true,

          // Set appropriate timestamp fields
          ...(data.osmId && { osmLastUpdated: new Date() }),
          ...(data.googlePlaceId && { googleLastUpdated: new Date() })
        }
      });
    }
  }

  async updateMetadata(id: string, metadata: any) {
    return this.prisma.location.update({
      where: { id },
      data: {
        metadata,
        lastUpdated: new Date()
      }
    });
  }

  // Enhanced stale data detection for multi-provider refresh
  async findStaleLocations(olderThanHours: number = 24, provider?: 'osm' | 'google') {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

    const whereClause: any = {
      source: { not: 'manual' }
    };

    if (provider === 'osm') {
      whereClause.AND = [
        { osmId: { not: null } },
        {
          OR: [
            { osmLastUpdated: { lt: cutoffDate } },
            { osmLastUpdated: null }
          ]
        }
      ];
    } else if (provider === 'google') {
      whereClause.AND = [
        { googlePlaceId: { not: null } },
        {
          OR: [
            { googleLastUpdated: { lt: cutoffDate } },
            { googleLastUpdated: null }
          ]
        }
      ];
    } else {
      // General stale data
      whereClause.lastUpdated = { lt: cutoffDate };
    }

    return this.prisma.location.findMany({
      where: whereClause,
      orderBy: { qualityScore: 'desc' }
    });
  }

  // Find locations that could benefit from Google enrichment
  async findLocationsForGoogleEnrichment(limit: number = 50) {
    return this.prisma.location.findMany({
      where: {
        AND: [
          { googlePlaceId: null }, // Not yet enriched with Google data
          { source: { in: ['osm', 'manual'] } }, // OSM or manual locations
          {
            OR: [
              { category: { in: ['restaurant', 'cafe', 'bar', 'attraction'] } },
              { qualityScore: { gte: 0.7 } } // High quality locations worth enriching
            ]
          }
        ]
      },
      orderBy: [
        { qualityScore: 'desc' },
        { createdAt: 'desc' }
      ],
      take: limit
    });
  }

  async deleteByExternalId(externalId: string, source: string): Promise<void> {
    const location = await this.findByExternalId(externalId, source);

    if (location) {
      await this.prisma.location.delete({
        where: { id: location.id }
      });
    }
  }

  // Enhanced analytics methods for multi-provider insights
  async getProviderStats() {
    const stats = await this.prisma.location.groupBy({
      by: ['source'],
      _count: { source: true },
      _avg: { qualityScore: true, rating: true },
      orderBy: { _count: { source: 'desc' } }
    });

    return stats.map(stat => ({
      provider: stat.source,
      count: stat._count.source,
      avgQualityScore: stat._avg.qualityScore,
      avgRating: stat._avg.rating
    }));
  }

  async getMergeStatusStats() {
    return this.prisma.location.groupBy({
      by: ['mergeStatus'],
      _count: { mergeStatus: true },
      orderBy: { _count: { mergeStatus: 'desc' } }
    });
  }

  private calculateBoundingBox(lat: number, lng: number, radiusMeters: number) {
    // Rough approximation: 1 degree ≈ 111,000 meters
    const latDelta = radiusMeters / 111000;
    const lngDelta = radiusMeters / (111000 * Math.cos(lat * Math.PI / 180));

    return {
      minLat: lat - latDelta,
      maxLat: lat + latDelta,
      minLng: lng - lngDelta,
      maxLng: lng + lngDelta
    };
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    // Haversine formula for distance calculation
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  }
}