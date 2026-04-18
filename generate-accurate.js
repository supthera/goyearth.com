#!/usr/bin/env node
/**
 * Fetches Natural Earth 110m country polygons, groups them by continent,
 * projects every coordinate with North-Pole-centred azimuthal equidistant
 * projection, simplifies, and outputs SVG <g> elements ready for the HTML.
 */

const https = require("https");
const http  = require("http");

/* ── projection constants ── */
const R  = 380;        // SVG radius = 90°S
const CX = 500;
const CY = 500;

function project(lat, lon) {
  const latRad  = (lat * Math.PI) / 180;
  const lonRad  = (lon * Math.PI) / 180;
  const colatitude = Math.PI / 2 - latRad;          // 0 at pole, π at south pole
  const r = (colatitude / Math.PI) * R;
  const x = CX + r * Math.sin(lonRad);
  const y = CY - r * Math.cos(lonRad);
  return [+(x.toFixed(1)), +(y.toFixed(1))];
}

/* ── continent mapping (ISO A3 → continent) ── */
const continentOf = {
  // North America
  CAN:"North America",USA:"North America",MEX:"North America",GTM:"North America",
  BLZ:"North America",SLV:"North America",HND:"North America",NIC:"North America",
  CRI:"North America",PAN:"North America",CUB:"North America",JAM:"North America",
  HTI:"North America",DOM:"North America",PRI:"North America",TTO:"North America",
  BHS:"North America",GRL:"North America",
  // South America
  COL:"South America",VEN:"South America",GUY:"South America",SUR:"South America",
  ECU:"South America",PER:"South America",BRA:"South America",BOL:"South America",
  PRY:"South America",URY:"South America",ARG:"South America",CHL:"South America",
  GUF:"South America",FLK:"South America",
  // Europe
  ISL:"Europe",NOR:"Europe",SWE:"Europe",FIN:"Europe",RUS:"Europe",
  EST:"Europe",LVA:"Europe",LTU:"Europe",BLR:"Europe",UKR:"Europe",
  MDA:"Europe",ROU:"Europe",BGR:"Europe",GRC:"Europe",TUR:"Europe",
  CYP:"Europe",ALB:"Europe",MNE:"Europe",MKD:"Europe",SRB:"Europe",
  BIH:"Europe",HRV:"Europe",SVN:"Europe",HUN:"Europe",SVK:"Europe",
  CZE:"Europe",POL:"Europe",DEU:"Europe",AUT:"Europe",CHE:"Europe",
  LIE:"Europe",NLD:"Europe",BEL:"Europe",LUX:"Europe",FRA:"Europe",
  GBR:"Europe",IRL:"Europe",PRT:"Europe",ESP:"Europe",ITA:"Europe",
  DNK:"Europe",KOS:"Europe",
  // Africa
  MAR:"Africa",DZA:"Africa",TUN:"Africa",LBY:"Africa",EGY:"Africa",
  MRT:"Africa",MLI:"Africa",NER:"Africa",TCD:"Africa",SDN:"Africa",
  SSD:"Africa",ERI:"Africa",DJI:"Africa",SOM:"Africa",ETH:"Africa",
  KEN:"Africa",UGA:"Africa",RWA:"Africa",BDI:"Africa",COD:"Africa",
  COG:"Africa",GAB:"Africa",GNQ:"Africa",CMR:"Africa",NGA:"Africa",
  BEN:"Africa",TGO:"Africa",GHA:"Africa",CIV:"Africa",LBR:"Africa",
  SLE:"Africa",GIN:"Africa",GNB:"Africa",GMB:"Africa",SEN:"Africa",
  BFA:"Africa",AGO:"Africa",ZMB:"Africa",MWI:"Africa",MOZ:"Africa",
  ZWE:"Africa",BWA:"Africa",NAM:"Africa",ZAF:"Africa",SWZ:"Africa",
  LSO:"Africa",MDG:"Africa",TZA:"Africa",CAF:"Africa",ESH:"Africa",
  SAH:"Africa",SOL:"Africa",
  // Asia
  GEO:"Asia",ARM:"Asia",AZE:"Asia",IRN:"Asia",IRQ:"Asia",SYR:"Asia",
  LBN:"Asia",ISR:"Asia",JOR:"Asia",SAU:"Asia",YEM:"Asia",OMN:"Asia",
  ARE:"Asia",QAT:"Asia",KWT:"Asia",BHR:"Asia",AFG:"Asia",PAK:"Asia",
  IND:"Asia",NPL:"Asia",BTN:"Asia",BGD:"Asia",MMR:"Asia",THA:"Asia",
  LAO:"Asia",VNM:"Asia",KHM:"Asia",MYS:"Asia",SGP:"Asia",IDN:"Asia",
  PHL:"Asia",TWN:"Asia",CHN:"Asia",MNG:"Asia",PRK:"Asia",KOR:"Asia",
  JPN:"Asia",KAZ:"Asia",UZB:"Asia",TKM:"Asia",KGZ:"Asia",TJK:"Asia",
  TLS:"Asia",BRN:"Asia",PSE:"Asia",
  // Australia / Oceania
  AUS:"Australia",NZL:"Australia",PNG:"Australia",FJI:"Australia",
  SLB:"Australia",VUT:"Australia",NCL:"Australia",
  // Antarctica
  ATA:"Antarctica",
};

/* ── fetch JSON helper ── */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith("https") ? https.get : http.get;
    get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location).then(resolve, reject);
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("JSON parse failed: " + e.message)); }
      });
    }).on("error", reject);
  });
}

/* ── Douglas-Peucker simplification in SVG space ── */
function perpDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function simplify(pts, tol) {
  if (pts.length <= 2) return pts;
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > tol) {
    const left  = simplify(pts.slice(0, idx + 1), tol);
    const right = simplify(pts.slice(idx), tol);
    return left.slice(0, -1).concat(right);
  }
  return [pts[0], pts[pts.length - 1]];
}

/* ── ring to SVG path ── */
function ringToSVG(coords, tolerance) {
  const projected = coords.map(([lon, lat]) => project(lat, lon));
  const simple = simplify(projected, tolerance);
  if (simple.length < 3) return null;
  return simple.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ") + " Z";
}

/* ── main ── */
async function main() {
  const url = "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson";
  process.stderr.write("Fetching Natural Earth country polygons…\n");

  let geo;
  try {
    geo = await fetchJSON(url);
  } catch (e) {
    // Fallback URL
    process.stderr.write("Primary URL failed, trying fallback…\n");
    geo = await fetchJSON(
      "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"
    );
  }

  process.stderr.write(`Got ${geo.features.length} features.\n`);

  // Group rings by continent
  const continents = {};
  for (const ct of ["North America","South America","Europe","Africa","Asia","Australia","Antarctica"]) {
    continents[ct] = [];
  }

  for (const feat of geo.features) {
    const props = feat.properties;
    const code = props["ISO3166-1-Alpha-3"] || props.ISO_A3 || props.iso_a3 || props.ISO3 || props.id || "";
    const name = props.name || props.NAME || props.ADMIN || "";
    let cont = continentOf[code];

    // Try to match by name for Russia → split handled below
    if (!cont && /russia/i.test(name)) cont = "Europe";
    if (!cont) continue;

    const geom = feat.geometry;
    let polys = [];
    if (geom.type === "Polygon") {
      polys = [geom.coordinates];
    } else if (geom.type === "MultiPolygon") {
      polys = geom.coordinates;
    }

    // Russia special: split at 60°E — west goes to Europe, east to Asia
    if (/russia/i.test(name) || code === "RUS") {
      for (const poly of polys) {
        for (const ring of poly) {
          const avgLon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
          if (avgLon < 60) {
            continents["Europe"].push(ring);
          } else {
            continents["Asia"].push(ring);
          }
        }
      }
      continue;
    }

    for (const poly of polys) {
      for (const ring of poly) {
        continents[cont].push(ring);
      }
    }
  }

  // Tolerance for simplification (SVG pixels)
  const TOL = 2.5;

  process.stderr.write("Projecting and simplifying…\n");

  for (const [name, rings] of Object.entries(continents)) {
    if (name === "Antarctica") continue; // handled separately

    const paths = [];
    for (const ring of rings) {
      const d = ringToSVG(ring, TOL);
      if (d) paths.push(d);
    }
    if (paths.length === 0) continue;

    console.log(`            <g class="continent" data-name="${name}" tabindex="0">`);
    console.log(`              <path d="${paths.join(" ")}" />`);
    console.log(`            </g>`);
  }

  // Antarctica as thick outer ring (like the Gleason map)
  const outerR = 385, innerR = 340;
  const n = 72;
  let ad = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const jitter = 2 + 4 * Math.sin(a * 5);
    const r = outerR + jitter;
    const x = CX + r * Math.sin(a);
    const y = CY - r * Math.cos(a);
    ad += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)} `;
  }
  ad += "Z ";
  for (let i = n - 1; i >= 0; i--) {
    const a = (i / n) * 2 * Math.PI;
    const jitter = 3 * Math.sin(a * 7);
    const r = innerR + jitter;
    const x = CX + r * Math.sin(a);
    const y = CY - r * Math.cos(a);
    ad += `${i === n - 1 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)} `;
  }
  ad += "Z";
  console.log(`            <g class="continent" data-name="Antarctica" tabindex="0">`);
  console.log(`              <path d="${ad}" fill-rule="evenodd" />`);
  console.log(`            </g>`);

  process.stderr.write("Done.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
