/**
 * NoVA Microclimates API - Cloudflare Worker
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
    <title>NoVA Microclimates API</title>
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
        <h1>NoVA Microclimates API</h1>
        <p>Real-time temperature, humidity & air quality data for Northern Virginia via PurpleAir sensors</p>
    </div>

    <div class="container">
        <h2>Quick Start</h2>
        <pre><code>curl /nova-weather/
        {
          "updated": "2026-02-01T02:17:51.867Z",
          "neighborhood": "burke",
          "name": "Burke",
          "temp_f": 17,
          "humidity": 42,
          "pm2_5": 4.9,
          "aqi": 20,
          "aqi_category": "Good",
          "sensor_count": 3
        }</code></pre>

        <h2>Endpoints</h2>
        <div class="endpoint"><span class="endpoint-path">GET /nova-weather</span><span class="endpoint-desc">All areas</span></div>
        <div class="endpoint"><span class="endpoint-path">GET /nova-weather/:area</span><span class="endpoint-desc">Single area</span></div>
        <div class="endpoint"><span class="endpoint-path">GET /areas</span><span class="endpoint-desc">List all available</span></div>

        <h2>Available Areas</h2>
        <p>LIST AREAS HERE</p>
        <p>Use <code>GET /areas</code> for the full list.</p>

        <h2>About</h2>
        <p>Forked from <a href="https://github.com/solo-founders/sf-microclimates">SF Microclimates API</a></p>
        <p>AQI (Air Quality Index) is calculated using the US EPA formula from PM2.5 sensor data.</p>
        <p>Free to use. No API key required.</p>
    </div>

    <footer>
        <p>Powered by <a href="https://www.purpleair.com/">PurpleAir</a></p>
    </footer>
</body>
</html>`;

const NOVA_AREAS: Record<
    string,
    {
        name: string;
        county: string;
        bounds: { nwLat: number; nwLng: number; seLat: number; seLng: number };
    }
> = {
    // Arlington
    rosslyn: {
        name: "Rosslyn",
        county: "arlington",
        bounds: { nwLat: 38.902, nwLng: -77.085, seLat: 38.89, seLng: -77.065 },
    },
    clarendon: {
        name: "Clarendon",
        county: "arlington",
        bounds: {
            nwLat: 38.892,
            nwLng: -77.105,
            seLat: 38.878,
            seLng: -77.085,
        },
    },
    ballston: {
        name: "Ballston",
        county: "arlington",
        bounds: { nwLat: 38.89, nwLng: -77.125, seLat: 38.875, seLng: -77.1 },
    },
    crystal_city: {
        name: "Crystal City",
        county: "arlington",
        bounds: { nwLat: 38.862, nwLng: -77.06, seLat: 38.845, seLng: -77.04 },
    },
    pentagon_city: {
        name: "Pentagon City",
        county: "arlington",
        bounds: { nwLat: 38.87, nwLng: -77.07, seLat: 38.855, seLng: -77.05 },
    },
    shirlington: {
        name: "Shirlington",
        county: "arlington",
        bounds: {
            nwLat: 38.848,
            nwLng: -77.095,
            seLat: 38.832,
            seLng: -77.075,
        },
    },
    courthouse: {
        name: "Courthouse",
        county: "arlington",
        bounds: {
            nwLat: 38.895,
            nwLng: -77.095,
            seLat: 38.882,
            seLng: -77.075,
        },
    },
    virginia_square: {
        name: "Virginia Square",
        county: "arlington",
        bounds: { nwLat: 38.888, nwLng: -77.11, seLat: 38.876, seLng: -77.092 },
    },
    columbia_pike: {
        name: "Columbia Pike",
        county: "arlington",
        bounds: { nwLat: 38.865, nwLng: -77.115, seLat: 38.84, seLng: -77.085 },
    },
    cherrydale: {
        name: "Cherrydale",
        county: "arlington",
        bounds: { nwLat: 38.905, nwLng: -77.125, seLat: 38.89, seLng: -77.1 },
    },
    bluemont: {
        name: "Bluemont",
        county: "arlington",
        bounds: { nwLat: 38.885, nwLng: -77.135, seLat: 38.87, seLng: -77.11 },
    },
    westover: {
        name: "Westover",
        county: "arlington",
        bounds: { nwLat: 38.898, nwLng: -77.135, seLat: 38.883, seLng: -77.11 },
    },
    east_falls_church: {
        name: "East Falls Church",
        county: "arlington",
        bounds: { nwLat: 38.895, nwLng: -77.16, seLat: 38.878, seLng: -77.135 },
    },
    aurora_highlands: {
        name: "Aurora Highlands",
        county: "arlington",
        bounds: { nwLat: 38.858, nwLng: -77.08, seLat: 38.842, seLng: -77.06 },
    },
    pentagon: {
        name: "Pentagon",
        county: "arlington",
        bounds: {
            nwLat: 38.878,
            nwLng: -77.065,
            seLat: 38.865,
            seLng: -77.045,
        },
    },
    // Fairfax
    tysons: {
        name: "Tysons",
        county: "fairfax",
        bounds: { nwLat: 38.945, nwLng: -77.25, seLat: 38.895, seLng: -77.17 },
    },
    reston: {
        name: "Reston",
        county: "fairfax",
        bounds: { nwLat: 38.995, nwLng: -77.4, seLat: 38.905, seLng: -77.29 },
    },
    herndon: {
        name: "Herndon",
        county: "fairfax",
        bounds: { nwLat: 39.0, nwLng: -77.44, seLat: 38.94, seLng: -77.35 },
    },
    mclean: {
        name: "McLean",
        county: "fairfax",
        bounds: { nwLat: 38.975, nwLng: -77.24, seLat: 38.9, seLng: -77.13 },
    },
    vienna: {
        name: "Vienna",
        county: "fairfax",
        bounds: { nwLat: 38.93, nwLng: -77.305, seLat: 38.87, seLng: -77.215 },
    },
    fairfax_city: {
        name: "Fairfax City",
        county: "fairfax",
        bounds: { nwLat: 38.88, nwLng: -77.345, seLat: 38.82, seLng: -77.255 },
    },
    annandale: {
        name: "Annandale",
        county: "fairfax",
        bounds: { nwLat: 38.86, nwLng: -77.24, seLat: 38.8, seLng: -77.15 },
    },
    springfield: {
        name: "Springfield",
        county: "fairfax",
        bounds: { nwLat: 38.82, nwLng: -77.23, seLat: 38.74, seLng: -77.13 },
    },
    burke: {
        name: "Burke",
        county: "fairfax",
        bounds: { nwLat: 38.83, nwLng: -77.31, seLat: 38.755, seLng: -77.215 },
    },
    centreville: {
        name: "Centreville",
        county: "fairfax",
        bounds: { nwLat: 38.88, nwLng: -77.48, seLat: 38.8, seLng: -77.38 },
    },
    chantilly: {
        name: "Chantilly",
        county: "fairfax",
        bounds: { nwLat: 38.93, nwLng: -77.485, seLat: 38.845, seLng: -77.365 },
    },
    oakton: {
        name: "Oakton",
        county: "fairfax",
        bounds: { nwLat: 38.92, nwLng: -77.34, seLat: 38.86, seLng: -77.25 },
    },
    great_falls: {
        name: "Great Falls",
        county: "fairfax",
        bounds: { nwLat: 39.04, nwLng: -77.345, seLat: 38.955, seLng: -77.225 },
    },
    lorton: {
        name: "Lorton",
        county: "fairfax",
        bounds: { nwLat: 38.745, nwLng: -77.27, seLat: 38.66, seLng: -77.17 },
    },
    mount_vernon: {
        name: "Mount Vernon",
        county: "fairfax",
        bounds: { nwLat: 38.77, nwLng: -77.14, seLat: 38.685, seLng: -77.03 },
    },
    franconia: {
        name: "Franconia",
        county: "fairfax",
        bounds: { nwLat: 38.8, nwLng: -77.19, seLat: 38.735, seLng: -77.1 },
    },
    kingstowne: {
        name: "Kingstowne",
        county: "fairfax",
        bounds: { nwLat: 38.79, nwLng: -77.165, seLat: 38.735, seLng: -77.085 },
    },
    fort_belvoir: {
        name: "Fort Belvoir",
        county: "fairfax",
        bounds: { nwLat: 38.75, nwLng: -77.2, seLat: 38.67, seLng: -77.1 },
    },
    newington: {
        name: "Newington",
        county: "fairfax",
        bounds: { nwLat: 38.765, nwLng: -77.23, seLat: 38.705, seLng: -77.15 },
    },
    clifton: {
        name: "Clifton",
        county: "fairfax",
        bounds: { nwLat: 38.81, nwLng: -77.425, seLat: 38.735, seLng: -77.325 },
    },
    fairfax_station: {
        name: "Fairfax Station",
        county: "fairfax",
        bounds: { nwLat: 38.83, nwLng: -77.365, seLat: 38.75, seLng: -77.265 },
    },
    merrifield: {
        name: "Merrifield",
        county: "fairfax",
        bounds: { nwLat: 38.895, nwLng: -77.265, seLat: 38.84, seLng: -77.19 },
    },
    dunn_loring: {
        name: "Dunn Loring",
        county: "fairfax",
        bounds: { nwLat: 38.91, nwLng: -77.255, seLat: 38.86, seLng: -77.185 },
    },
    baileys_crossroads: {
        name: "Bailey's Crossroads",
        county: "fairfax",
        bounds: { nwLat: 38.87, nwLng: -77.155, seLat: 38.82, seLng: -77.085 },
    },
    seven_corners: {
        name: "Seven Corners",
        county: "fairfax",
        bounds: { nwLat: 38.89, nwLng: -77.18, seLat: 38.84, seLng: -77.11 },
    },
    hybla_valley: {
        name: "Hybla Valley",
        county: "fairfax",
        bounds: { nwLat: 38.77, nwLng: -77.115, seLat: 38.715, seLng: -77.04 },
    },
    rose_hill: {
        name: "Rose Hill",
        county: "fairfax",
        bounds: {
            nwLat: 38.785,
            nwLng: -77.145,
            seLat: 38.735,
            seLng: -77.075,
        },
    },
    huntington: {
        name: "Huntington",
        county: "fairfax",
        bounds: { nwLat: 38.81, nwLng: -77.105, seLat: 38.755, seLng: -77.03 },
    },
    fort_hunt: {
        name: "Fort Hunt",
        county: "fairfax",
        bounds: { nwLat: 38.75, nwLng: -77.09, seLat: 38.695, seLng: -77.015 },
    },
    woodlawn: {
        name: "Woodlawn",
        county: "fairfax",
        bounds: { nwLat: 38.74, nwLng: -77.13, seLat: 38.685, seLng: -77.055 },
    },
    mason_neck: {
        name: "Mason Neck",
        county: "fairfax",
        bounds: { nwLat: 38.69, nwLng: -77.245, seLat: 38.6, seLng: -77.125 },
    },
    wolf_trap: {
        name: "Wolf Trap",
        county: "fairfax",
        bounds: { nwLat: 38.96, nwLng: -77.295, seLat: 38.905, seLng: -77.225 },
    },
    west_springfield: {
        name: "West Springfield",
        county: "fairfax",
        bounds: { nwLat: 38.79, nwLng: -77.255, seLat: 38.73, seLng: -77.17 },
    },
    kings_park: {
        name: "Kings Park",
        county: "fairfax",
        bounds: { nwLat: 38.82, nwLng: -77.265, seLat: 38.765, seLng: -77.195 },
    },
    mantua: {
        name: "Mantua",
        county: "fairfax",
        bounds: { nwLat: 38.89, nwLng: -77.285, seLat: 38.84, seLng: -77.215 },
    },
    lake_barcroft: {
        name: "Lake Barcroft",
        county: "fairfax",
        bounds: { nwLat: 38.87, nwLng: -77.185, seLat: 38.82, seLng: -77.12 },
    },
    fair_oaks: {
        name: "Fair Oaks",
        county: "fairfax",
        bounds: { nwLat: 38.89, nwLng: -77.395, seLat: 38.83, seLng: -77.315 },
    },
    falls_church: {
        name: "Falls Church",
        county: "fairfax",
        bounds: { nwLat: 38.91, nwLng: -77.21, seLat: 38.85, seLng: -77.135 },
    },
    pimmit_hills: {
        name: "Pimmit Hills",
        county: "fairfax",
        bounds: { nwLat: 38.93, nwLng: -77.21, seLat: 38.88, seLng: -77.14 },
    },
};

const NOVA_BOUNDS = {
    nwLat: 39.04, // great_falls north
    nwLng: -77.485, // chantilly west
    seLat: 38.6, // mason_neck south
    seLng: -77.015, // fort_hunt east
};

interface PurpleAirSensor {
    sensor_index: number;
    latitude: number;
    longitude: number;
    temperature?: number;
    humidity?: number;
    pm2_5?: number;
}

interface AreaData {
    temp_f: number | null;
    humidity: number | null;
    pm2_5: number | null;
    aqi: number | null;
    aqi_category: string | null;
    sensor_count: number;
}

interface WeatherResponse {
    updated: string;
    areas: Record<string, AreaData>;
}

// AQI Calculation using US EPA formula
// Source: https://community.purpleair.com/t/how-to-calculate-the-us-epa-pm2-5-aqi/877
function calcAQI(
    Cp: number,
    Ih: number,
    Il: number,
    BPh: number,
    BPl: number,
): number {
    return Math.round(((Ih - Il) / (BPh - BPl)) * (Cp - BPl) + Il);
}

function aqiFromPM25(pm: number): number {
    if (pm < 0) return 0;
    if (pm > 350.5) return calcAQI(pm, 500, 401, 500.4, 350.5);
    if (pm > 250.5) return calcAQI(pm, 400, 301, 350.4, 250.5);
    if (pm > 150.5) return calcAQI(pm, 300, 201, 250.4, 150.5);
    if (pm > 55.5) return calcAQI(pm, 200, 151, 150.4, 55.5);
    if (pm > 35.5) return calcAQI(pm, 150, 101, 55.4, 35.5);
    if (pm > 12.1) return calcAQI(pm, 100, 51, 35.4, 12.1);
    if (pm >= 0) return calcAQI(pm, 50, 0, 12, 0);
    return 0;
}

type AQICategory =
    | "Good"
    | "Moderate"
    | "Unhealthy for Sensitive Groups"
    | "Unhealthy"
    | "Very Unhealthy"
    | "Hazardous";

function getAQICategory(aqi: number): AQICategory {
    if (aqi <= 50) return "Good";
    if (aqi <= 100) return "Moderate";
    if (aqi <= 150) return "Unhealthy for Sensitive Groups";
    if (aqi <= 200) return "Unhealthy";
    if (aqi <= 300) return "Very Unhealthy";
    return "Hazardous";
}

function isInBounds(
    lat: number,
    lng: number,
    bounds: { nwLat: number; nwLng: number; seLat: number; seLng: number },
): boolean {
    return (
        lat <= bounds.nwLat &&
        lat >= bounds.seLat &&
        lng >= bounds.nwLng &&
        lng <= bounds.seLng
    );
}

function getNeighborhoodCenter(bounds: {
    nwLat: number;
    nwLng: number;
    seLat: number;
    seLng: number;
}): { lat: number; lng: number } {
    return {
        lat: (bounds.nwLat + bounds.seLat) / 2,
        lng: (bounds.nwLng + bounds.seLng) / 2,
    };
}

function getDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
): number {
    return Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lng2 - lng1, 2));
}

function findNearestArea(
    targetKey: string,
    availableKeys: string[],
): string | null {
    if (availableKeys.length === 0) return null;
    const targetCenter = getNeighborhoodCenter(NOVA_AREAS[targetKey].bounds);

    let nearest: string | null = null;
    let minDistance = Infinity;

    for (const key of availableKeys) {
        const center = getNeighborhoodCenter(NOVA_AREAS[key].bounds);
        const distance = getDistance(
            targetCenter.lat,
            targetCenter.lng,
            center.lat,
            center.lng,
        );
        if (distance < minDistance) {
            minDistance = distance;
            nearest = key;
        }
    }
    return nearest;
}

function findNearestAreas(
    targetKey: string,
    availableKeys: string[],
    count: number,
): string[] {
    const targetCenter = getNeighborhoodCenter(NOVA_AREAS[targetKey].bounds);

    const distances = availableKeys
        .filter((k) => k !== targetKey)
        .map((key) => {
            const center = getNeighborhoodCenter(NOVA_AREAS[key].bounds);
            return {
                key,
                distance: getDistance(
                    targetCenter.lat,
                    targetCenter.lng,
                    center.lat,
                    center.lng,
                ),
            };
        })
        .sort((a, b) => a.distance - b.distance);

    return distances.slice(0, count).map((d) => d.key);
}

const OUTLIER_THRESHOLD_F = 10; // Flag if >10°F different from neighbors
const OUTLIER_MIN_NEIGHBORS = 3; // Need at least 3 neighbors to compare

function detectAndCorrectOutliers(
    areas: Record<string, AreaData>,
): Record<string, AreaData> {
    const keysWithData = Object.keys(areas).filter(
        (k) => areas[k].sensor_count > 0 && areas[k].temp_f !== null,
    );

    const result: Record<string, AreaData> = { ...areas };

    for (const key of keysWithData) {
        const data = areas[key];
        if (data.temp_f === null) continue;

        // Find nearest neighbors with data
        const nearestKeys = findNearestAreas(
            key,
            keysWithData,
            OUTLIER_MIN_NEIGHBORS,
        );
        if (nearestKeys.length < OUTLIER_MIN_NEIGHBORS) continue;

        // Calculate neighbor average
        const areaTemps = nearestKeys
            .map((k) => areas[k].temp_f)
            .filter((t): t is number => t !== null);

        if (areaTemps.length < OUTLIER_MIN_NEIGHBORS) continue;

        const neighborAvg =
            areaTemps.reduce((a, b) => a + b, 0) / areaTemps.length;
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
                    reason: `Single sensor reading ${data.temp_f}°F was ${Math.round(diff)}°F off from neighbors (avg ${Math.round(neighborAvg)}°F)`,
                },
            } as AreaData & { outlier_corrected: object };
        }
    }

    return result;
}

function assignToArea(lat: number, lng: number): string | null {
    for (const [key, area] of Object.entries(NOVA_AREAS)) {
        if (isInBounds(lat, lng, area.bounds)) return key;
    }
    return null;
}

async function fetchPurpleAirData(apiKey: string): Promise<PurpleAirSensor[]> {
    const fields =
        "sensor_index,latitude,longitude,temperature,humidity,pm2.5_10minute";
    const url = `https://api.purpleair.com/v1/sensors?fields=${fields}&location_type=0&nwlat=${NOVA_BOUNDS.nwLat}&nwlng=${NOVA_BOUNDS.nwLng}&selat=${NOVA_BOUNDS.seLat}&selng=${NOVA_BOUNDS.seLng}`;

    const response = await fetch(url, { headers: { "X-API-Key": apiKey } });
    if (!response.ok)
        throw new Error(`PurpleAir API error: ${response.status}`);

    const data = (await response.json()) as {
        fields: string[];
        data: (number | null)[][];
    };
    const fieldIndices: Record<string, number> = {};
    data.fields.forEach((field, idx) => {
        fieldIndices[field] = idx;
    });

    return data.data.map((row) => ({
        sensor_index: row[fieldIndices.sensor_index] as number,
        latitude: row[fieldIndices.latitude] as number,
        longitude: row[fieldIndices.longitude] as number,
        temperature: row[fieldIndices.temperature] as number | undefined,
        humidity: row[fieldIndices.humidity] as number | undefined,
        pm2_5: row[fieldIndices["pm2.5_10minute"]] as number | undefined,
    }));
}

function aggregateByArea(sensors: PurpleAirSensor[]): Record<string, AreaData> {
    const areaSensors: Record<
        string,
        { temps: number[]; humidities: number[]; pm2_5s: number[] }
    > = {};
    for (const key of Object.keys(NOVA_AREAS)) {
        areaSensors[key] = { temps: [], humidities: [], pm2_5s: [] };
    }

    for (const sensor of sensors) {
        const area = assignToArea(sensor.latitude, sensor.longitude);
        if (area && areaSensors[area]) {
            if (
                sensor.temperature !== undefined &&
                sensor.temperature !== null
            ) {
                areaSensors[area].temps.push(sensor.temperature);
            }
            if (sensor.humidity !== undefined && sensor.humidity !== null) {
                areaSensors[area].humidities.push(sensor.humidity);
            }
            if (
                sensor.pm2_5 !== undefined &&
                sensor.pm2_5 !== null &&
                sensor.pm2_5 >= 0
            ) {
                areaSensors[area].pm2_5s.push(sensor.pm2_5);
            }
        }
    }

    const result: Record<string, AreaData> = {};
    const TEMP_CORRECTION_F = 8;
    for (const [key, data] of Object.entries(areaSensors)) {
        const avgTemp =
            data.temps.length > 0
                ? Math.round(
                      data.temps.reduce((a, b) => a + b, 0) / data.temps.length,
                  ) - TEMP_CORRECTION_F
                : null;
        const avgHumidity =
            data.humidities.length > 0
                ? Math.round(
                      data.humidities.reduce((a, b) => a + b, 0) /
                          data.humidities.length,
                  )
                : null;
        const avgPM25 =
            data.pm2_5s.length > 0
                ? Math.round(
                      (data.pm2_5s.reduce((a, b) => a + b, 0) /
                          data.pm2_5s.length) *
                          10,
                  ) / 10
                : null;
        const aqi = avgPM25 !== null ? aqiFromPM25(avgPM25) : null;
        const aqiCategory = aqi !== null ? getAQICategory(aqi) : null;

        result[key] = {
            temp_f: avgTemp,
            humidity: avgHumidity,
            pm2_5: avgPM25,
            aqi,
            aqi_category: aqiCategory,
            sensor_count: data.temps.length,
        };
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
    const rawAreas = aggregateByArea(sensors);

    // Detect and correct outliers (e.g., single bad sensor reading 14°F off from neighbors)
    const areas = detectAndCorrectOutliers(rawAreas);

    const response: WeatherResponse = {
        updated: new Date().toISOString(),
        areas,
    };

    if (env.CACHE) {
        await env.CACHE.put(cacheKey, JSON.stringify(response), {
            expirationTtl: cacheTtl,
        });
    }
    return response;
}

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=300",
        },
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
            return errorResponse(
                "Rate limit exceeded. Try again in a minute.",
                429,
            );
        }

        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                },
            });
        }

        if (request.method !== "GET")
            return errorResponse("Method not allowed", 405);

        try {
            if (path === "/nova-weather" || path === "/nova-weather/") {
                return jsonResponse(await getWeatherData(env));
            }

            const areaMatch = path.match(/^\/nova-weather\/([a-z_]+)$/);
            if (areaMatch) {
                const areaKey = areaMatch[1];
                if (!NOVA_AREAS[areaKey]) {
                    return errorResponse(`Unknown area: ${areaKey}`, 404);
                }
                const data = await getWeatherData(env);

                // Check if this area has sensor data
                const areaData = data.areas[areaKey];
                if (!areaData || areaData.sensor_count === 0) {
                    // Find nearest area with data
                    const availableKeys = Object.keys(data.areas).filter(
                        (k) => data.areas[k].sensor_count > 0,
                    );
                    const nearestKey = findNearestArea(areaKey, availableKeys);

                    if (nearestKey) {
                        const nearestData = data.areas[nearestKey];
                        return jsonResponse({
                            updated: data.updated,
                            area: areaKey,
                            name: NOVA_AREAS[areaKey].name,
                            temp_f: nearestData.temp_f,
                            humidity: nearestData.humidity,
                            pm2_5: nearestData.pm2_5,
                            aqi: nearestData.aqi,
                            aqi_category: nearestData.aqi_category,
                            sensor_count: 0,
                            fallback: {
                                source_area: nearestKey,
                                source_name: NOVA_AREAS[nearestKey].name,
                                source_sensor_count: nearestData.sensor_count,
                                reason: "No sensors in requested area",
                            },
                        });
                    }
                }

                return jsonResponse({
                    updated: data.updated,
                    neighborhood: areaKey,
                    name: NOVA_AREAS[areaKey].name,
                    ...areaData,
                });
            }

            if (path === "/areas" || path === "/areas/") {
                return jsonResponse({
                    areas: Object.entries(NOVA_AREAS).map(([key, val]) => ({
                        key,
                        name: val.name,
                    })),
                });
            }

            if (path === "/" || path === "") {
                return new Response(LANDING_HTML, {
                    headers: {
                        "Content-Type": "text/html;charset=UTF-8",
                        "Cache-Control": "public, max-age=3600",
                    },
                });
            }

            return errorResponse(
                "Not found. Try /sf-weather or /sf-weather/:area",
                404,
            );
        } catch (error) {
            console.error("Error:", error);
            return errorResponse(
                error instanceof Error
                    ? error.message
                    : "Internal server error",
                500,
            );
        }
    },
};
