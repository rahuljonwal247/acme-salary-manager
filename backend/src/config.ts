const DEV_SECRET = 'dev-only-insecure-secret-change-me';

export interface Config {
  port: number;
  corsOrigins: string[];
  jwtSecret: string;
  jwtTtl: string;
  anthropicApiKey: string | undefined;
  assistantModel: string;
  isProduction: boolean;
}

/** Reads and validates environment configuration once at startup. Fails fast on unsafe production config. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const isProduction = env.NODE_ENV === 'production';
  const jwtSecret = env.JWT_SECRET ?? (isProduction ? '' : DEV_SECRET);
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters in production');
  }
  return {
    port: Number(env.PORT ?? 4000),
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
    jwtSecret,
    jwtTtl: env.JWT_TTL ?? '8h',
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    assistantModel: env.ASSISTANT_MODEL ?? 'claude-opus-5-5',
    isProduction,
  };
}
