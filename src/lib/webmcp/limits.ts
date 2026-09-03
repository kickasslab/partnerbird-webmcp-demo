export const webmcpPlanLimits = {
  free: { searchPer10Minutes: 30, writesPerHour: 20, outreachPerHour: 5, outreachPerDay: 10 },
  pro: { searchPer10Minutes: 60, writesPerHour: 50, outreachPerHour: 10, outreachPerDay: 20 },
  business: { searchPer10Minutes: 100, writesPerHour: 100, outreachPerHour: 12, outreachPerDay: 25 },
} as const;

export const webmcpInboundLimits = { standard: 20, strict: 8, very_strict: 3 } as const;
