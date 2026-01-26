/**
 * SF Microclimates API - Cloudflare Worker
 * Real-time temperature & humidity data for San Francisco neighborhoods
 * Powered by PurpleAir sensor data
 */

export interface Env {
  PURPLEAIR_API_KEY: string;
  CACHE: KVNamespace;
  CACHE_TTL_SECONDS: string;
  RATE_LIMITER: RateLimit;
}

const LANDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SF Microclimates API</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; line-height: 1.6; }
        .container { max-width: 800px; margin: 0 auto; padding: 40px 24px; }
        h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
        h2 { font-size: 1.5rem; margin: 2rem 0 1rem; color: #444; }
        p { margin-bottom: 1rem; }
        pre { background: #1a1a1a; color: #f0f0f0; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 14px; margin: 1rem 0; }
        code { font-family: 'SF Mono', Monaco, Consolas, monospace; }
        .endpoint { background: white; padding: 12px 16px; border-radius: 6px; margin: 8px 0; display: flex; justify-content: space-between; }
        .endpoint-path { font-family: monospace; font-weight: 600; }
        .endpoint-desc { color: #666; }
        .hero { background: #2563eb; color: white; padding: 60px 24px; text-align: center; }
        .hero h1 { color: white; }
        .hero p { color: rgba(255,255,255,0.9); max-width: 500px; margin: 0 auto; }
        footer { text-align: center; padding: 40px; color: #666; font-size: 14px; }
        a { color: #2563eb; }
    </style>
</head>
<body>
    <div class="hero">
        <h1>SF Microclimates API</h1>
        <p>Real-time temperature & humidity data for San Francisco neighborhoods via PurpleAir sensors</p>
    </div>

    <div class="container">
        <h2>Quick Start</h2>
        <pre><code>curl /sf-weather/mission

{
  "neighborhood": "mission",
  "name": "Mission District",
  "temp_f": 68,
  "humidity": 45,
  "sensor_count": 29
}</code></pre>

        <h2>Endpoints</h2>
        <div class="endpoint"><span class="endpoint-path">GET /sf-weather</span><span class="endpoint-desc">All neighborhoods</span></div>
        <div class="endpoint"><span class="endpoint-path">GET /sf-weather/:neighborhood</span><span class="endpoint-desc">Single neighborhood</span></div>
        <div class="endpoint"><span class="endpoint-path">GET /neighborhoods</span><span class="endpoint-desc">List all available</span></div>

        <h2>Available Neighborhoods</h2>
        <p>49 neighborhoods including: mission, castro, marina, soma, haight, noe_valley, outer_sunset, inner_richmond, north_beach, pacific_heights, potrero, twin_peaks, hayes_valley, presidio, and more.</p>
        <p>Use <code>GET /neighborhoods</code> for the full list.</p>

        <h2>About</h2>
        <p>San Francisco is famous for its microclimates. This API aggregates data from 400+ PurpleAir sensors to give you real temperature readings by neighborhood.</p>
        <p>Free to use. No API key required.</p>
    </div>

    <footer>
        <p>Powered by <a href="https://www.purpleair.com/">PurpleAir</a> · <a href="https://github.com/solo-founders/sf-microclimates">View on GitHub</a></p>
    </footer>
</body>
</html>`;

// SF Neighborhoods with approximate bounding boxes (lat/lng)
const SF_NEIGHBORHOODS: Record<string, { name: string; bounds: { nwLat: number; nwLng: number; seLat: number; seLng: number } }> = {
  financial_district: { name: "Financial District", bounds: { nwLat: 37.7960, nwLng: -122.4050, seLat: 37.7880, seLng: -122.3920 } },
  chinatown: { name: "Chinatown", bounds: { nwLat: 37.7980, nwLng: -122.4100, seLat: 37.7920, seLng: -122.4030 } },
  union_square: { name: "Union Square", bounds: { nwLat: 37.7920, nwLng: -122.4120, seLat: 37.7850, seLng: -122.4030 } },
  tenderloin: { name: "Tenderloin", bounds: { nwLat: 37.7880, nwLng: -122.4200, seLat: 37.7800, seLng: -122.4080 } },
  civic_center: { name: "Civic Center", bounds: { nwLat: 37.7830, nwLng: -122.4250, seLat: 37.7750, seLng: -122.4130 } },
  embarcadero: { name: "Embarcadero", bounds: { nwLat: 37.8050, nwLng: -122.4000, seLat: 37.7850, seLng: -122.3850 } },
  rincon_hill: { name: "Rincon Hill", bounds: { nwLat: 37.7900, nwLng: -122.3950, seLat: 37.7830, seLng: -122.3850 } },
  south_beach: { name: "South Beach", bounds: { nwLat: 37.7870, nwLng: -122.3950, seLat: 37.7780, seLng: -122.3850 } },
  north_beach: { name: "North Beach", bounds: { nwLat: 37.8080, nwLng: -122.4180, seLat: 37.7970, seLng: -122.4020 } },
  telegraph_hill: { name: "Telegraph Hill", bounds: { nwLat: 37.8050, nwLng: -122.4080, seLat: 37.7980, seLng: -122.3990 } },
  russian_hill: { name: "Russian Hill", bounds: { nwLat: 37.8030, nwLng: -122.4250, seLat: 37.7940, seLng: -122.4100 } },
  nob_hill: { name: "Nob Hill", bounds: { nwLat: 37.7950, nwLng: -122.4200, seLat: 37.7880, seLng: -122.4080 } },
  marina: { name: "Marina", bounds: { nwLat: 37.8080, nwLng: -122.4500, seLat: 37.7980, seLng: -122.4280 } },
  pacific_heights: { name: "Pacific Heights", bounds: { nwLat: 37.7980, nwLng: -122.4450, seLat: 37.7870, seLng: -122.4200 } },
  presidio: { name: "Presidio", bounds: { nwLat: 37.8050, nwLng: -122.4850, seLat: 37.7850, seLng: -122.4450 } },
  sea_cliff: { name: "Sea Cliff", bounds: { nwLat: 37.7900, nwLng: -122.4950, seLat: 37.7820, seLng: -122.4780 } },
  lands_end: { name: "Lands End", bounds: { nwLat: 37.7900, nwLng: -122.5150, seLat: 37.7780, seLng: -122.4950 } },
  inner_richmond: { name: "Inner Richmond", bounds: { nwLat: 37.7870, nwLng: -122.4650, seLat: 37.7750, seLng: -122.4450 } },
  outer_richmond: { name: "Outer Richmond", bounds: { nwLat: 37.7870, nwLng: -122.5100, seLat: 37.7750, seLng: -122.4650 } },
  inner_sunset: { name: "Inner Sunset", bounds: { nwLat: 37.7680, nwLng: -122.4700, seLat: 37.7550, seLng: -122.4500 } },
  outer_sunset: { name: "Outer Sunset", bounds: { nwLat: 37.7600, nwLng: -122.5100, seLat: 37.7380, seLng: -122.4700 } },
  parkside: { name: "Parkside", bounds: { nwLat: 37.7450, nwLng: -122.4900, seLat: 37.7350, seLng: -122.4700 } },
  haight: { name: "Haight-Ashbury", bounds: { nwLat: 37.7750, nwLng: -122.4550, seLat: 37.7660, seLng: -122.4400 } },
  lower_haight: { name: "Lower Haight", bounds: { nwLat: 37.7750, nwLng: -122.4400, seLat: 37.7700, seLng: -122.4250 } },
  hayes_valley: { name: "Hayes Valley", bounds: { nwLat: 37.7800, nwLng: -122.4320, seLat: 37.7720, seLng: -122.4180 } },
  cole_valley: { name: "Cole Valley", bounds: { nwLat: 37.7680, nwLng: -122.4530, seLat: 37.7600, seLng: -122.4420 } },
  castro: { name: "Castro", bounds: { nwLat: 37.7680, nwLng: -122.4400, seLat: 37.7560, seLng: -122.4280 } },
  noe_valley: { name: "Noe Valley", bounds: { nwLat: 37.7560, nwLng: -122.4400, seLat: 37.7420, seLng: -122.4200 } },
  mission: { name: "Mission District", bounds: { nwLat: 37.7680, nwLng: -122.4280, seLat: 37.7480, seLng: -122.4050 } },
  soma: { name: "SoMa", bounds: { nwLat: 37.7880, nwLng: -122.4150, seLat: 37.7700, seLng: -122.3900 } },
  mission_bay: { name: "Mission Bay", bounds: { nwLat: 37.7780, nwLng: -122.4000, seLat: 37.7650, seLng: -122.3850 } },
  twin_peaks: { name: "Twin Peaks", bounds: { nwLat: 37.7600, nwLng: -122.4550, seLat: 37.7480, seLng: -122.4380 } },
  diamond_heights: { name: "Diamond Heights", bounds: { nwLat: 37.7480, nwLng: -122.4450, seLat: 37.7380, seLng: -122.4300 } },
  glen_park: { name: "Glen Park", bounds: { nwLat: 37.7420, nwLng: -122.4400, seLat: 37.7280, seLng: -122.4250 } },
  forest_hill: { name: "Forest Hill", bounds: { nwLat: 37.7550, nwLng: -122.4650, seLat: 37.7450, seLng: -122.4500 } },
  west_portal: { name: "West Portal", bounds: { nwLat: 37.7450, nwLng: -122.4700, seLat: 37.7350, seLng: -122.4580 } },
  st_francis_wood: { name: "St. Francis Wood", bounds: { nwLat: 37.7400, nwLng: -122.4700, seLat: 37.7300, seLng: -122.4550 } },
  bernal_heights: { name: "Bernal Heights", bounds: { nwLat: 37.7480, nwLng: -122.4200, seLat: 37.7320, seLng: -122.4000 } },
  potrero_hill: { name: "Potrero Hill", bounds: { nwLat: 37.7650, nwLng: -122.4050, seLat: 37.7500, seLng: -122.3900 } },
  dogpatch: { name: "Dogpatch", bounds: { nwLat: 37.7650, nwLng: -122.3950, seLat: 37.7530, seLng: -122.3850 } },
  bayview: { name: "Bayview", bounds: { nwLat: 37.7450, nwLng: -122.4000, seLat: 37.7200, seLng: -122.3700 } },
  hunters_point: { name: "Hunters Point", bounds: { nwLat: 37.7350, nwLng: -122.3900, seLat: 37.7100, seLng: -122.3650 } },
  excelsior: { name: "Excelsior", bounds: { nwLat: 37.7320, nwLng: -122.4350, seLat: 37.7150, seLng: -122.4100 } },
  visitacion_valley: { name: "Visitacion Valley", bounds: { nwLat: 37.7200, nwLng: -122.4150, seLat: 37.7080, seLng: -122.3950 } },
  crocker_amazon: { name: "Crocker Amazon", bounds: { nwLat: 37.7220, nwLng: -122.4400, seLat: 37.7080, seLng: -122.4200 } },
  ingleside: { name: "Ingleside", bounds: { nwLat: 37.7300, nwLng: -122.4600, seLat: 37.7150, seLng: -122.4400 } },
  oceanview: { name: "Oceanview", bounds: { nwLat: 37.7200, nwLng: -122.4600, seLat: 37.7100, seLng: -122.4400 } },
  merced_heights: { name: "Merced Heights", bounds: { nwLat: 37.7180, nwLng: -122.4700, seLat: 37.7100, seLng: -122.4550 } },
  lakeside: { name: "Lakeside", bounds: { nwLat: 37.7300, nwLng: -122.4850, seLat: 37.7200, seLng: -122.4700 } },
  stonestown: { name: "Stonestown", bounds: { nwLat: 37.7280, nwLng: -122.4800, seLat: 37.7200, seLng: -122.4700 } }
};

const SF_BOUNDS = {
  nwLat: 37.8120,
  nwLng: -122.5200,
  seLat: 37.7080,
  seLng: -122.3550
};

interface PurpleAirSensor {
  sensor_index: number;
  latitude: number;
  longitude: number;
  temperature?: number;
  humidity?: number;
}

interface NeighborhoodData {
  temp_f: number | null;
  humidity: number | null;
  sensor_count: number;
}

interface WeatherResponse {
  updated: string;
  neighborhoods: Record<string, NeighborhoodData>;
}

function isInBounds(lat: number, lng: number, bounds: { nwLat: number; nwLng: number; seLat: number; seLng: number }): boolean {
  return lat <= bounds.nwLat && lat >= bounds.seLat && lng >= bounds.nwLng && lng <= bounds.seLng;
}

function getNeighborhoodCenter(bounds: { nwLat: number; nwLng: number; seLat: number; seLng: number }): { lat: number; lng: number } {
  return {
    lat: (bounds.nwLat + bounds.seLat) / 2,
    lng: (bounds.nwLng + bounds.seLng) / 2
  };
}

function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lng2 - lng1, 2));
}

function findNearestNeighborhood(targetKey: string, availableKeys: string[]): string | null {
  if (availableKeys.length === 0) return null;
  const targetCenter = getNeighborhoodCenter(SF_NEIGHBORHOODS[targetKey].bounds);
  
  let nearest: string | null = null;
  let minDistance = Infinity;
  
  for (const key of availableKeys) {
    const center = getNeighborhoodCenter(SF_NEIGHBORHOODS[key].bounds);
    const distance = getDistance(targetCenter.lat, targetCenter.lng, center.lat, center.lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = key;
    }
  }
  return nearest;
}

function findNearestNeighborhoods(targetKey: string, availableKeys: string[], count: number): string[] {
  const targetCenter = getNeighborhoodCenter(SF_NEIGHBORHOODS[targetKey].bounds);
  
  const distances = availableKeys
    .filter(k => k !== targetKey)
    .map(key => {
      const center = getNeighborhoodCenter(SF_NEIGHBORHOODS[key].bounds);
      return {
        key,
        distance: getDistance(targetCenter.lat, targetCenter.lng, center.lat, center.lng)
      };
    })
    .sort((a, b) => a.distance - b.distance);
  
  return distances.slice(0, count).map(d => d.key);
}

const OUTLIER_THRESHOLD_F = 10; // Flag if >10°F different from neighbors
const OUTLIER_MIN_NEIGHBORS = 3; // Need at least 3 neighbors to compare

function detectAndCorrectOutliers(neighborhoods: Record<string, NeighborhoodData>): Record<string, NeighborhoodData> {
  const keysWithData = Object.keys(neighborhoods).filter(k => 
    neighborhoods[k].sensor_count > 0 && neighborhoods[k].temp_f !== null
  );
  
  const result: Record<string, NeighborhoodData> = { ...neighborhoods };
  
  for (const key of keysWithData) {
    const data = neighborhoods[key];
    if (data.temp_f === null) continue;
    
    // Find nearest neighbors with data
    const nearestKeys = findNearestNeighborhoods(key, keysWithData, OUTLIER_MIN_NEIGHBORS);
    if (nearestKeys.length < OUTLIER_MIN_NEIGHBORS) continue;
    
    // Calculate neighbor average
    const neighborTemps = nearestKeys
      .map(k => neighborhoods[k].temp_f)
      .filter((t): t is number => t !== null);
    
    if (neighborTemps.length < OUTLIER_MIN_NEIGHBORS) continue;
    
    const neighborAvg = neighborTemps.reduce((a, b) => a + b, 0) / neighborTemps.length;
    const diff = Math.abs(data.temp_f - neighborAvg);
    
    // If outlier detected AND low sensor count, correct it
    if (diff > OUTLIER_THRESHOLD_F && data.sensor_count <= 2) {
      const correctedTemp = Math.round(neighborAvg);
      result[key] = {
        ...data,
        temp_f: correctedTemp,
        outlier_corrected: {
          original_temp_f: data.temp_f,
          neighbor_avg_f: Math.round(neighborAvg),
          diff_f: Math.round(diff),
          reason: `Single sensor reading ${data.temp_f}°F was ${Math.round(diff)}°F off from neighbors (avg ${Math.round(neighborAvg)}°F)`
        }
      } as NeighborhoodData & { outlier_corrected: object };
    }
  }
  
  return result;
}

function assignToNeighborhood(lat: number, lng: number): string | null {
  for (const [key, neighborhood] of Object.entries(SF_NEIGHBORHOODS)) {
    if (isInBounds(lat, lng, neighborhood.bounds)) return key;
  }
  return null;
}

async function fetchPurpleAirData(apiKey: string): Promise<PurpleAirSensor[]> {
  const fields = "sensor_index,latitude,longitude,temperature,humidity";
  const url = `https://api.purpleair.com/v1/sensors?fields=${fields}&location_type=0&nwlat=${SF_BOUNDS.nwLat}&nwlng=${SF_BOUNDS.nwLng}&selat=${SF_BOUNDS.seLat}&selng=${SF_BOUNDS.seLng}`;

  const response = await fetch(url, { headers: { "X-API-Key": apiKey } });
  if (!response.ok) throw new Error(`PurpleAir API error: ${response.status}`);

  const data = await response.json() as { fields: string[]; data: (number | null)[][] };
  const fieldIndices: Record<string, number> = {};
  data.fields.forEach((field, idx) => { fieldIndices[field] = idx; });

  return data.data.map(row => ({
    sensor_index: row[fieldIndices.sensor_index] as number,
    latitude: row[fieldIndices.latitude] as number,
    longitude: row[fieldIndices.longitude] as number,
    temperature: row[fieldIndices.temperature] as number | undefined,
    humidity: row[fieldIndices.humidity] as number | undefined
  }));
}

function aggregateByNeighborhood(sensors: PurpleAirSensor[]): Record<string, NeighborhoodData> {
  const neighborhoodSensors: Record<string, { temps: number[]; humidities: number[] }> = {};
  for (const key of Object.keys(SF_NEIGHBORHOODS)) {
    neighborhoodSensors[key] = { temps: [], humidities: [] };
  }

  for (const sensor of sensors) {
    const neighborhood = assignToNeighborhood(sensor.latitude, sensor.longitude);
    if (neighborhood && neighborhoodSensors[neighborhood]) {
      if (sensor.temperature !== undefined && sensor.temperature !== null) {
        neighborhoodSensors[neighborhood].temps.push(sensor.temperature);
      }
      if (sensor.humidity !== undefined && sensor.humidity !== null) {
        neighborhoodSensors[neighborhood].humidities.push(sensor.humidity);
      }
    }
  }

  const result: Record<string, NeighborhoodData> = {};
  const TEMP_CORRECTION_F = 8;
  for (const [key, data] of Object.entries(neighborhoodSensors)) {
    const avgTemp = data.temps.length > 0
      ? Math.round(data.temps.reduce((a, b) => a + b, 0) / data.temps.length) - TEMP_CORRECTION_F
      : null;
    const avgHumidity = data.humidities.length > 0
      ? Math.round(data.humidities.reduce((a, b) => a + b, 0) / data.humidities.length)
      : null;
    result[key] = { temp_f: avgTemp, humidity: avgHumidity, sensor_count: data.temps.length };
  }
  return result;
}

async function getWeatherData(env: Env): Promise<WeatherResponse> {
  const cacheKey = "sf-weather-data";
  const cacheTtl = parseInt(env.CACHE_TTL_SECONDS || "900", 10);

  if (env.CACHE) {
    const cached = await env.CACHE.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  const sensors = await fetchPurpleAirData(env.PURPLEAIR_API_KEY);
  const rawNeighborhoods = aggregateByNeighborhood(sensors);
  
  // Detect and correct outliers (e.g., single bad sensor reading 14°F off from neighbors)
  const neighborhoods = detectAndCorrectOutliers(rawNeighborhoods);
  
  const response: WeatherResponse = { updated: new Date().toISOString(), neighborhoods };

  if (env.CACHE) {
    await env.CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: cacheTtl });
  }
  return response;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300"
    }
  });
}

function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
    const { success } = await env.RATE_LIMITER.limit({ key: clientIP });
    if (!success) {
      return errorResponse("Rate limit exceeded. Try again in a minute.", 429);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    if (request.method !== "GET") return errorResponse("Method not allowed", 405);

    try {
      if (path === "/sf-weather" || path === "/sf-weather/") {
        return jsonResponse(await getWeatherData(env));
      }

      const neighborhoodMatch = path.match(/^\/sf-weather\/([a-z_]+)$/);
      if (neighborhoodMatch) {
        const neighborhoodKey = neighborhoodMatch[1];
        if (!SF_NEIGHBORHOODS[neighborhoodKey]) {
          return errorResponse(`Unknown neighborhood: ${neighborhoodKey}`, 404);
        }
        const data = await getWeatherData(env);
        
        // Check if this neighborhood has sensor data
        const neighborhoodData = data.neighborhoods[neighborhoodKey];
        if (neighborhoodData.sensor_count === 0) {
          // Find nearest neighborhood with data
          const availableKeys = Object.keys(data.neighborhoods).filter(k => data.neighborhoods[k].sensor_count > 0);
          const nearestKey = findNearestNeighborhood(neighborhoodKey, availableKeys);
          
          if (nearestKey) {
            const nearestData = data.neighborhoods[nearestKey];
            return jsonResponse({
              updated: data.updated,
              neighborhood: neighborhoodKey,
              name: SF_NEIGHBORHOODS[neighborhoodKey].name,
              temp_f: nearestData.temp_f,
              humidity: nearestData.humidity,
              sensor_count: 0,
              fallback: {
                source_neighborhood: nearestKey,
                source_name: SF_NEIGHBORHOODS[nearestKey].name,
                source_sensor_count: nearestData.sensor_count,
                reason: "No sensors in requested neighborhood"
              }
            });
          }
        }
        
        return jsonResponse({
          updated: data.updated,
          neighborhood: neighborhoodKey,
          name: SF_NEIGHBORHOODS[neighborhoodKey].name,
          ...neighborhoodData
        });
      }

      if (path === "/neighborhoods" || path === "/neighborhoods/") {
        return jsonResponse({
          neighborhoods: Object.entries(SF_NEIGHBORHOODS).map(([key, val]) => ({ key, name: val.name }))
        });
      }

      if (path === "/" || path === "") {
        return new Response(LANDING_HTML, {
          headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "public, max-age=3600" }
        });
      }

      return errorResponse("Not found. Try /sf-weather or /sf-weather/:neighborhood", 404);
    } catch (error) {
      console.error("Error:", error);
      return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
    }
  }
};
