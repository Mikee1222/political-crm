const WMO: Record<number, string> = {
  0: "Αίθριος",
  1: "Κυρίως αίθριος",
  2: "Μερικώς νεφελώδης",
  3: "Νεφελώδης",
  45: "Ομίχλη",
  48: "Ομίχλη",
  51: "Ψιλή βροχή",
  61: "Βροχή",
  63: "Βροχή",
  65: "Έντονη βροχή",
  71: "Χιόνι",
  80: "Μπόρες",
  95: "Καταιγίδα",
};

export async function fetchWeatherForCity(city: string): Promise<Record<string, unknown>> {
  const name = city.trim();
  if (!name) throw new Error("Χρειάζεται όνομα πόλης");
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=3&language=el&format=json`;
  const geoRes = await fetch(geoUrl, { next: { revalidate: 0 } } as RequestInit);
  const geo = (await geoRes.json()) as {
    results?: Array<{ name: string; country: string; latitude: number; longitude: number; admin1?: string }>;
  };
  const hit = geo.results?.[0];
  if (!hit) {
    return { ok: false, error: `Δεν βρέθηκε πόλη: ${name}` };
  }
  const { latitude, longitude } = hit;
  const wxUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto";
  const wxRes = await fetch(wxUrl);
  const wx = (await wxRes.json()) as {
    current?: {
      temperature_2m?: number;
      relative_humidity_2m?: number;
      weather_code?: number;
      wind_speed_10m?: number;
      time?: string;
    };
  };
  const c = wx.current;
  const code = c?.weather_code ?? 0;
  return {
    ok: true,
    city: hit.name,
    region: hit.admin1 ?? null,
    country: hit.country,
    latitude,
    longitude,
    observed_at: c?.time ?? null,
    temperature_c: c?.temperature_2m ?? null,
    humidity_pct: c?.relative_humidity_2m ?? null,
    wind_kmh: c?.wind_speed_10m ?? null,
    conditions: WMO[code] ?? `Κωδικός ${code}`,
  };
}
