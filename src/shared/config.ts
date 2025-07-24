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
  };
  apis: {
    openai: string | undefined;
    mapbox: string | undefined;
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
  },
  apis: {
    openai: getOptionalEnvVar('OPENAI_API_KEY'),
    mapbox: getOptionalEnvVar('MAPBOX_API_KEY'),
  },
};

// Validate critical configuration on startup
if (config.server.nodeEnv === 'production' && config.auth.jwtSecret === 'your_super_secret_jwt_key_change_this_in_production') {
  throw new Error('JWT_SECRET must be changed in production!');
}

console.log(`🔧 Configuration loaded for ${config.server.nodeEnv} environment`);