import { config } from '@shared/config';
import {
  LocationProvider,
  LocationSearchRequest,
  LocationSearchResponse,
  Place,
  POICategory,
  POI_CATEGORY_MAPPING
} from '../types';

interface OSMNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

interface OSMWay {
  type: 'way';
  id: number;
  nodes: number[];
  tags: Record<string, string>;
  center?: { lat: number; lon: number };
}

interface OSMRelation {
  type: 'relation';
  id: number;
  members: Array<{
    type: 'node' | 'way' | 'relation';
    ref: number;
    role: string;
  }>;
  tags: Record<string, string>;
  center?: { lat: number; lon: number };
}

type OSMElement = OSMNode | OSMWay | OSMRelation;

interface OSMResponse {
  version: number;
  generator: string;
  elements: OSMElement[];
}

export class OSMProvider implements LocationProvider {
  private readonly endpoint: string;
  private readonly timeout: number;
  private readonly userAgent: string;

  constructor() {
    this.endpoint = config.location.osmEndpoint;
    this.timeout = config.location.timeout;
    this.userAgent = config.location.osmUserAgent;
  }

  async searchNearby(request: LocationSearchRequest): Promise<LocationSearchResponse> {
    const startTime = Date.now();

    try {
      const query = this.buildOverpassQuery(request);
      const response = await this.executeQuery(query);
      const places = this.parseResponse(response, request);

      return {
        places,
        metadata: {
          provider: 'osm',
          responseTime: Date.now() - startTime,
          totalResults: places.length,
          searchRadius: request.radius || config.location.defaultRadius,
          categoriesSearched: request.categories?.map(cat => cat.toString()) || [],
          cached: false
        }
      };
    } catch (error) {
      throw new Error(`OSM search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPlaceDetails(externalId: string): Promise<Place | null> {
    try {
      const query = `
        [out:json][timeout:${Math.floor(this.timeout / 1000)}];
        (
          node(${externalId});
          way(${externalId});
          relation(${externalId});
        );
        out center meta;
      `;

      const response = await this.executeQuery(query);

      if (response.elements.length === 0) {
        return null;
      }

      const element = response.elements[0];
      return this.elementToPlace(element, 0);
    } catch (error) {
      console.warn(`Failed to get OSM place details for ${externalId}:`, error);
      return null;
    }
  }

  private buildOverpassQuery(request: LocationSearchRequest): string {
    const { latitude, longitude, radius, categories } = request;
    const searchRadius = radius || config.location.defaultRadius;
    const timeoutSeconds = Math.floor(this.timeout / 1000);

    // Build category filters
    const categoryQueries = this.buildCategoryQueries(
      categories || Object.values(POICategory),
      latitude,
      longitude,
      searchRadius
    );

    const query = `
      [out:json][timeout:${timeoutSeconds}];
      (
        ${categoryQueries.join('\n        ')}
      );
      out center meta;
    `;

    return query;
  }

  private buildCategoryQueries(categories: POICategory[], latitude: number, longitude: number, radius: number): string[] {
    const queries: string[] = [];

    for (const category of categories) {
      const osmTags = POI_CATEGORY_MAPPING[category];
      if (!osmTags) continue;

      for (const tag of osmTags) {
        // Split tag into key=value
        const [key, value] = tag.split('=');
        if (!key || !value) continue;

        queries.push(
          `node["${key}"="${value}"](around:${radius},${latitude},${longitude});`,
          `way["${key}"="${value}"](around:${radius},${latitude},${longitude});`,
          `relation["${key}"="${value}"](around:${radius},${latitude},${longitude});`
        );
      }
    }

    return queries;
  }

  private async executeQuery(query: string): Promise<OSMResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'User-Agent': this.userAgent
        },
        body: query,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`OSM API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.elements) {
        throw new Error('Invalid OSM response format');
      }

      return data as OSMResponse;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('OSM request timeout');
      }

      throw error;
    }
  }

  private parseResponse(response: OSMResponse, request: LocationSearchRequest): Place[] {
    const places: Place[] = [];
    const { latitude: searchLat, longitude: searchLng } = request;

    for (const element of response.elements) {
      try {
        const place = this.elementToPlace(element, this.calculateDistance(
          searchLat,
          searchLng,
          this.getElementCoordinates(element)
        ));

        if (place) {
          places.push(place);
        }
      } catch (error) {
        console.warn('Failed to parse OSM element:', element.id, error);
        continue;
      }
    }

    // Sort by distance and apply limit
    places.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    return places.slice(0, request.limit || config.location.resultsPerCategory);
  }

  private elementToPlace(element: OSMElement, distance: number): Place | null {
    const name = this.extractName(element);
    if (!name) return null;

    const coordinates = this.getElementCoordinates(element);
    const category = this.categorizeElement(element);
    const subcategory = this.getSubcategory(element);

    return {
      id: `osm_${element.type}_${element.id}`,
      name,
      category,
      subcategory,
      coordinates,
      distance,
      address: this.extractAddress(element),
      description: this.extractDescription(element),
      metadata: {
        source: 'osm',
        externalId: `${element.type}/${element.id}`,
        lastUpdated: new Date(),
        verified: true,
        osm: {
          id: `${element.type}/${element.id}`,
          type: element.type,
          tags: element.tags
        },
        contact: this.extractContact(element),
        hours: this.extractHours(element),
        features: this.extractFeatures(element)
      }
    };
  }

  private extractName(element: OSMElement): string | null {
    const tags = element.tags;
    return tags.name || tags.brand || tags.operator || null;
  }

  private getElementCoordinates(element: OSMElement): { latitude: number; longitude: number } {
    if (element.type === 'node') {
      return { latitude: element.lat, longitude: element.lon };
    }

    // For ways and relations, use center if available
    if ('center' in element && element.center) {
      return { latitude: element.center.lat, longitude: element.center.lon };
    }

    // Fallback - this shouldn't happen with 'out center' but just in case
    return { latitude: 0, longitude: 0 };
  }

  private categorizeElement(element: OSMElement): POICategory {
    const tags = element.tags;

    // Try to match against our category mappings
    for (const [category, osmTags] of Object.entries(POI_CATEGORY_MAPPING)) {
      for (const osmTag of osmTags) {
        const [key, value] = osmTag.split('=');
        if (tags[key] === value) {
          return category as POICategory;
        }
      }
    }

    // Fallback categorization based on common tags
    if (tags.amenity) {
      switch (tags.amenity) {
        case 'restaurant':
        case 'cafe':
        case 'bar':
        case 'pub':
          return POICategory.RESTAURANT;
        case 'pharmacy':
          return POICategory.PHARMACY;
        case 'bank':
          return POICategory.BANK;
        case 'atm':
          return POICategory.ATM;
        default:
          return POICategory.ATTRACTION;
      }
    }

    if (tags.tourism) {
      return POICategory.ATTRACTION;
    }

    if (tags.leisure) {
      return POICategory.PARK;
    }

    if (tags.shop) {
      return POICategory.SHOP;
    }

    return POICategory.ATTRACTION;
  }

  private getSubcategory(element: OSMElement): string {
    const tags = element.tags;

    // Return the most specific tag available
    return tags.amenity ||
      tags.tourism ||
      tags.leisure ||
      tags.shop ||
      tags.historic ||
      'unknown';
  }

  private extractAddress(element: OSMElement): string | null {
    const tags = element.tags;
    const addressParts: string[] = [];

    if (tags['addr:housenumber']) addressParts.push(tags['addr:housenumber']);
    if (tags['addr:street']) addressParts.push(tags['addr:street']);
    if (tags['addr:city']) addressParts.push(tags['addr:city']);
    if (tags['addr:postcode']) addressParts.push(tags['addr:postcode']);

    return addressParts.length > 0 ? addressParts.join(', ') : null;
  }

  private extractDescription(element: OSMElement): string | null {
    const tags = element.tags;
    return tags.description || tags.note || null;
  }

  private extractContact(element: OSMElement): { phone?: string; website?: string; email?: string } | undefined {
    const tags = element.tags;
    const contact: any = {};

    if (tags.phone) contact.phone = tags.phone;
    if (tags.website) contact.website = tags.website;
    if (tags.email) contact.email = tags.email;

    return Object.keys(contact).length > 0 ? contact : undefined;
  }

  private extractHours(element: OSMElement): Record<string, string> | undefined {
    const tags = element.tags;
    const hours: Record<string, string> = {};

    if (tags.opening_hours) {
      // Simple parsing - in a real implementation, you'd use a proper opening_hours parser
      hours.general = tags.opening_hours;
    }

    // Individual day parsing
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    for (const day of days) {
      const tagKey = `opening_hours:${day}`;
      if (tags[tagKey]) {
        hours[day] = tags[tagKey];
      }
    }

    return Object.keys(hours).length > 0 ? hours : undefined;
  }

  private extractFeatures(element: OSMElement): string[] {
    const tags = element.tags;
    const features: string[] = [];

    // Common features
    if (tags.wifi === 'yes' || tags.internet_access === 'wlan') features.push('wifi');
    if (tags.wheelchair === 'yes') features.push('wheelchair_accessible');
    if (tags.outdoor_seating === 'yes') features.push('outdoor_seating');
    if (tags.smoking === 'no') features.push('non_smoking');
    if (tags.takeaway === 'yes') features.push('takeaway');
    if (tags.delivery === 'yes') features.push('delivery');

    return features;
  }

  private calculateDistance(lat1: number, lng1: number, coords: { latitude: number; longitude: number }): number {
    const { latitude: lat2, longitude: lng2 } = coords;

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
    return !!(this.endpoint && this.userAgent);
  }

  getProviderName(): string {
    return 'osm';
  }
}