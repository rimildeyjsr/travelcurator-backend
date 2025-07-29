// src/shared/config.ts - UPDATED WITH HYBRID SUPPORT
import 'dotenv/config';

interface Config {
  server: {
    port: number;
    host: string;
    nodeEnv: 'development' | 'production' | 'test';
  };
  database: {
    url: string;
  };
  auth: {
    jwtSecret: string;
    accessTokenExpiry: string;
    refreshTokenExpiry: string;
    saltRounds: number;
  };
  apis: {
    openai: string | undefined;
    mapbox: string | undefined;
    gemini: string | undefined;
    googlePlaces: string | undefined;
  };
  ai: {
    provider: 'gemini' | 'openai' | 'claude';
    fallbackProvider?: 'gemini' | 'openai' | 'claude';
    enableCaching: boolean;
    cacheTimeout: number;
    maxRetries: number;
    timeout: number;
  };
  location: {
    primaryProvider: 'osm' | 'google' | 'hybrid'; // ADDED hybrid
    fallbackProvider?: 'osm' | 'google' | 'hybrid'; // ADDED hybrid
    enableCaching: boolean;
    cacheTimeout: number;
    defaultRadius: number;
    maxRadius: number;
    resultsPerCategory: number;
    osmEndpoint: string;
    osmUserAgent: string;
    timeout: number;
  };
}

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name] ?? defaultValue;
  if (!value) {
    throw new Error(`Environment variable ${name} is required but not set`);
  }
  return value;
}

function getOptionalEnvVar(name: string): string | undefined {
  return process.env[name];
}

export const config: Config = {
  server: {
    port: parseInt(getEnvVar('PORT', '3000'), 10),
    host: getEnvVar('HOST', '0.0.0.0'),
    nodeEnv: getEnvVar('NODE_ENV', 'development') as Config['server']['nodeEnv'],
  },
  database: {
    url: getEnvVar('DATABASE_URL', 'postgresql://localhost:5432/travelcurator'),
  },
  auth: {
    jwtSecret: getEnvVar('JWT_SECRET'),
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
    saltRounds: 10
  },
  apis: {
    openai: getOptionalEnvVar('OPENAI_API_KEY'),
    mapbox: getOptionalEnvVar('MAPBOX_API_KEY'),
    gemini: getOptionalEnvVar('GEMINI_API_KEY'),
    googlePlaces: getOptionalEnvVar('GOOGLE_PLACES_API_KEY')
  },
  ai: (() => {
    const provider = getEnvVar('AI_PROVIDER', 'gemini');
    const fallbackProvider = getOptionalEnvVar('AI_FALLBACK_PROVIDER');

    const validProviders = ['gemini', 'openai', 'claude'] as const;
    if (!validProviders.includes(provider as any)) {
      throw new Error(`Invalid AI_PROVIDER: ${provider}. Must be one of: ${validProviders.join(', ')}`);
    }

    if (fallbackProvider && !validProviders.includes(fallbackProvider as any)) {
      throw new Error(`Invalid AI_FALLBACK_PROVIDER: ${fallbackProvider}. Must be one of: ${validProviders.join(', ')}`);
    }

    return {
      provider: provider as 'gemini' | 'openai' | 'claude',
      ...(fallbackProvider && { fallbackProvider: fallbackProvider as 'gemini' | 'openai' | 'claude' }),
      enableCaching: getEnvVar('AI_ENABLE_CACHING', 'true') === 'true',
      cacheTimeout: parseInt(getEnvVar('AI_CACHE_TIMEOUT', '300'), 10),
      maxRetries: parseInt(getEnvVar('AI_MAX_RETRIES', '3'), 10),
      timeout: parseInt(getEnvVar('AI_TIMEOUT', '30000'), 10),
    };
  })(),
  location: (() => {
    const provider = getEnvVar('LOCATION_PROVIDER', 'hybrid'); // CHANGED DEFAULT to hybrid
    const fallbackProvider = getOptionalEnvVar('LOCATION_FALLBACK_PROVIDER');

    const validProviders = ['osm', 'google', 'hybrid'] as const; // ADDED hybrid
    if (!validProviders.includes(provider as any)) {
      throw new Error(`Invalid LOCATION_PROVIDER: ${provider}. Must be one of: ${validProviders.join(', ')}`);
    }

    if (fallbackProvider && !validProviders.includes(fallbackProvider as any)) {
      throw new Error(`Invalid LOCATION_FALLBACK_PROVIDER: ${fallbackProvider}. Must be one of: ${validProviders.join(', ')}`);
    }

    return {
      primaryProvider: provider as 'osm' | 'google' | 'hybrid', // UPDATED type
      ...(fallbackProvider && { fallbackProvider: fallbackProvider as 'osm' | 'google' | 'hybrid' }), // UPDATED type
      enableCaching: getEnvVar('LOCATION_ENABLE_CACHING', 'true') === 'true',
      cacheTimeout: parseInt(getEnvVar('LOCATION_CACHE_TIMEOUT', '300'), 10), // 5 minutes
      defaultRadius: parseInt(getEnvVar('LOCATION_DEFAULT_RADIUS', '2000'), 10), // 2km
      maxRadius: parseInt(getEnvVar('LOCATION_MAX_RADIUS', '10000'), 10), // 10km
      resultsPerCategory: parseInt(getEnvVar('LOCATION_RESULTS_PER_CATEGORY', '10'), 10),
      osmEndpoint: getEnvVar('OSM_ENDPOINT', 'https://overpass-api.de/api/interpreter'),
      osmUserAgent: getEnvVar('OSM_USER_AGENT', 'TravelCurator/1.0'),
      timeout: parseInt(getEnvVar('LOCATION_TIMEOUT', '10000'), 10), // 10 seconds
    };
  })(),
};

// Validate critical configuration on startup
if (config.server.nodeEnv === 'production' && config.auth.jwtSecret === 'your_super_secret_jwt_key_change_this_in_production') {
  throw new Error('JWT_SECRET must be changed in production!');
}

console.log(`🔧 Configuration loaded for ${config.server.nodeEnv} environment`);
console.log(`🤖 AI Provider: ${config.ai.provider}`);
console.log(`🗺️ Location Provider: ${config.location.primaryProvider}`);