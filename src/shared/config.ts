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
  };
  ai: {
    provider: 'gemini' | 'openai' | 'claude';
    fallbackProvider?: 'gemini' | 'openai' | 'claude';
    enableCaching: boolean;
    cacheTimeout: number;
    maxRetries: number;
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
    accessTokenExpiry: '15m',        // Short-lived for security
    refreshTokenExpiry: '7d',        // Long-lived for UX
    saltRounds: 10                   // bcrypt salt rounds
  },
  apis: {
    openai: getOptionalEnvVar('OPENAI_API_KEY'),
    mapbox: getOptionalEnvVar('MAPBOX_API_KEY'),
    gemini: getOptionalEnvVar('GEMINI_API_KEY')
  },
  ai: (() => {
  const provider = getEnvVar('AI_PROVIDER', 'gemini');
  const fallbackProvider = getOptionalEnvVar('AI_FALLBACK_PROVIDER');

  // Validate provider values
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
};

// Validate critical configuration on startup
if (config.server.nodeEnv === 'production' && config.auth.jwtSecret === 'your_super_secret_jwt_key_change_this_in_production') {
  throw new Error('JWT_SECRET must be changed in production!');
}

console.log(`🔧 Configuration loaded for ${config.server.nodeEnv} environment`);