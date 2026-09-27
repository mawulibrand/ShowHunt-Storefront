export function parseEnvironment(env: Record<string, string | undefined>): Readonly<{ mode: string; databaseUrl: string; port: number }>;
