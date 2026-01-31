# Nova Microclimates API

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Free API](https://img.shields.io/badge/API-Free%20to%20use-blue.svg)](https://microclimates.solofounders.com)

**Real weather for Northen Virginia. Free API. No key required.**

**Example website:** [view weather in all regions of San Francisco](https://microclimates.solofounders.com/all)

Use with [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Clawdbot](https://clawd.bot), or build into your apps.

See forked repo for more info

---

## Try It Instantly

```bash
curl https://microclimates.solofounders.com/sf-weather/mission
```

```json
{
  "neighborhood": "mission",
  "name": "Mission District",
  "temp_f": 58,
  "humidity": 52,
  "pm2_5": 12.1,
  "aqi": 50,
  "aqi_category": "Good",
  "sensor_count": 8
}
```

No API key. No signup. Just use it.

---

## Add to Claude Code or Clawdbot

Copy and paste this into your skills folder:

```markdown
# Create a new skill: sf-microclimates/SKILL.md


# SF Microclimates Skill

Get real-time SF neighborhood weather.

## Triggers
- "weather in [neighborhood]"
- "sf weather mission vs sunset"
- "is it foggy in the richmond?"

## Usage
curl https://microclimates.solofounders.com/sf-weather/marina

## Neighborhoods
mission, castro, marina, soma, haight, noe_valley,
outer_sunset, inner_sunset, outer_richmond, presidio,
north_beach, pacific_heights, potrero, twin_peaks...
```

---

## Use Cases

- **AI agents** — Give your agent real local weather context
- **Home automation** — Trigger based on your actual neighborhood temp
- **Slack/Discord bots** — Settle "is it foggy?" arguments
- **Travel apps** — Show tourists what to actually expect
- **Personal dashboards** — Finally, weather that matches your window

---

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /sf-weather` | All 50 neighborhoods |
| `GET /sf-weather/:neighborhood` | Single neighborhood |
| `GET /neighborhoods` | List all available |

---

## Response Format

### Single Neighborhood
```json
{
  "updated": "2026-01-25T23:00:00.000Z",
  "neighborhood": "outer_sunset",
  "name": "Outer Sunset",
  "temp_f": 52,
  "humidity": 78,
  "pm2_5": 8.3,
  "aqi": 35,
  "aqi_category": "Good",
  "sensor_count": 15
}
```

### All Neighborhoods
```json
{
  "updated": "2026-01-25T23:00:00.000Z",
  "neighborhoods": {
    "mission": { "temp_f": 58, "humidity": 52, "pm2_5": 12.1, "aqi": 50, "aqi_category": "Good", "sensor_count": 8 },
    "outer_sunset": { "temp_f": 52, "humidity": 78, "pm2_5": 8.3, "aqi": 35, "aqi_category": "Good", "sensor_count": 15 },
    "marina": { "temp_f": 55, "humidity": 65, "pm2_5": 18.5, "aqi": 64, "aqi_category": "Moderate", "sensor_count": 6 }
  }
}
```

---

## Air Quality

Each response includes real-time air quality data from PurpleAir sensors.

### Response Fields

| Field | Description |
|-------|-------------|
| `pm2_5` | PM2.5 concentration in µg/m³ (10-minute rolling average) |
| `aqi` | Air Quality Index (0-500 scale) |
| `aqi_category` | Human-readable AQI category |

### AQI Categories

| AQI Range | Category | Description |
|-----------|----------|-------------|
| 0–50 | Good | Air quality is satisfactory |
| 51–100 | Moderate | Acceptable; moderate health concern for sensitive individuals |
| 101–150 | Unhealthy for Sensitive Groups | Sensitive groups may experience health effects |
| 151–200 | Unhealthy | Everyone may begin to experience health effects |
| 201–300 | Very Unhealthy | Health alert; everyone may experience serious effects |
| 301+ | Hazardous | Health emergency; entire population affected |

### Calculation Method

AQI is calculated from PM2.5 using the **US EPA formula**:

1. The `pm2.5_10minute` field (10-minute rolling average) is used for real-time responsiveness
2. PM2.5 concentration is mapped to AQI breakpoints per EPA standards
3. Linear interpolation determines the final AQI value

This gives you accurate, hyperlocal air quality — not a city-wide average from a distant monitoring station.

---

## Self-Hosting

Want to run your own instance?

### 1. Clone & Install

```bash
git clone https://github.com/solo-founders/sf-microclimates.git
cd sf-microclimates
npm install
```

### 2. Get a PurpleAir API Key

This API uses [PurpleAir](https://www.purpleair.com/) sensors. Sign up at [develop.purpleair.com](https://develop.purpleair.com/) — free for personal use.

### 3. Create KV Namespace

```bash
wrangler kv:namespace create "CACHE"
```

Add the output to `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-namespace-id"
```

### 4. Set Your API Key

```bash
wrangler secret put PURPLEAIR_API_KEY
```

### 5. Deploy

```bash
wrangler deploy
```

### Local Development

```bash
echo "PURPLEAIR_API_KEY=your-key" > .dev.vars
wrangler dev
```

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHE_TTL_SECONDS` | `3600` | Cache duration (1 hour) |
| `RATE_LIMIT_PER_MINUTE` | `60` | Max requests per IP |

---

## How It Works

1. Request comes in → rate limit check
2. Check Cloudflare KV cache → return if fresh
3. Cache miss → fetch outdoor sensors from PurpleAir (`location_type=0`)
4. Group sensors by neighborhood GPS bounding boxes
5. Calculate averages, cache for 1 hour
6. Return JSON with CORS headers

---

## Fork for Your City

LA, Seattle, NYC, Chicago, Austin — every city has microclimates.

The neighborhood bounding boxes are in `src/index.ts`. To adapt:

1. Update `SF_NEIGHBORHOODS` with your city's areas + GPS coordinates
2. Change the PurpleAir bounding box to your city
3. Update branding
4. Deploy

PRs welcome! We'd love to see `la-microclimates`, `nyc-microclimates`, etc.

---

## Credits

- Sensor data: [PurpleAir](https://www.purpleair.com/)
- Infrastructure: [Cloudflare Workers](https://workers.cloudflare.com/)
- Built by: [Solo Founders](https://solofounders.com)

---

## License

MIT — use it however you want.
