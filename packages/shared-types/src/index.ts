/** All commerce amounts are integer pesewas; never floating-point cedis. */
export type Money = Readonly<{ currency: 'GHS'; minorUnits: number }>;
export type HealthResponse = Readonly<{ status: 'ok' | 'unavailable' }>;
