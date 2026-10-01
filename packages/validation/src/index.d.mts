type Environment = Readonly<{ mode: string; databaseUrl: string; port: number; poolMax: number }>;
export function parseEnvironment(env: Record<string, string | undefined>): Environment;
export function parseMigrationEnvironment(env: Record<string, string | undefined>): Environment;
