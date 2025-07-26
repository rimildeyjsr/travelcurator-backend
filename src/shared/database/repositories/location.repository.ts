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
  externalId: string | null;
  lastUpdated: Date;
  verified: boolean;
  address: string | null;
  description: string | null;
  metadata: any;
  distance: number;
}

export class LocationRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: any) {
    return this.prisma.location.create({ data });
  }

  async findById(id: string) {
    return this.prisma.location.findUnique({ where: { id } });
  }

  async findByExternalId(externalId: string, source: string) {
    return this.prisma.location.findFirst({
      where: {
        externalId,
        source
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
      orderBy: {
        createdAt: 'desc'
      }
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

  async upsertLocation(data: {
    externalId: string;
    source: string;
    name: string;
    latitude: number;
    longitude: number;
    category: string;
    address?: string | null;
    description?: string | null;
    metadata?: any;
  }) {
    // Use findFirst + create/update pattern
    const existing = await this.prisma.location.findFirst({
      where: {
        externalId: data.externalId,
        source: data.source
      }
    });

    if (existing) {
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
          lastUpdated: new Date(),
          verified: true
        }
      });
    } else {
      return this.prisma.location.create({
        data: {
          externalId: data.externalId,
          source: data.source,
          name: data.name,
          latitude: data.latitude,
          longitude: data.longitude,
          category: data.category,
          address: data.address || null,
          description: data.description || null,
          metadata: data.metadata,
          verified: true
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

  async findStaleLocations(olderThanHours: number = 24) {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

    return this.prisma.location.findMany({
      where: {
        lastUpdated: {
          lt: cutoffDate
        },
        source: {
          not: 'manual'
        }
      }
    });
  }

  async deleteByExternalId(externalId: string, source: string): Promise<void> {
    const location = await this.prisma.location.findFirst({
      where: {
        externalId,
        source
      }
    });

    if (location) {
      await this.prisma.location.delete({
        where: { id: location.id }
      });
    }
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