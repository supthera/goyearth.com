// Azimuthal equidistant projection centred on the North Pole
// 0° longitude at 12-o'clock, east longitudes clockwise
const R  = 375;   // SVG radius for 90 °S
const CX = 500;
const CY = 500;

function project(lat, lon) {
  const r     = ((90 - lat) / 180) * R;
  const theta = (lon * Math.PI) / 180;
  const x     = CX + r * Math.sin(theta);
  const y     = CY - r * Math.cos(theta);
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

function toPath(points) {
  return points
    .map(([lat, lon], i) => {
      const [x, y] = project(lat, lon);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ") + " Z";
}

function multiPath(groups) {
  return groups.map(g => toPath(g)).join(" ");
}

/* ───────── continent outlines (lat, lon) ───────── */

const northAmericaMain = [
  // Arctic Alaska → east along arctic coast
  [70, -165], [71, -155], [71, -140], [70, -130], [72, -120],
  [74, -95],  [73, -82],  [72, -72],
  // Baffin Island tip, then Labrador
  [68, -65],  [63, -62],  [60, -64],  [55, -58],  [52, -56],
  [49, -54],  [47, -53],
  // Maritimes → US East Coast
  [46, -60],  [44, -66],  [43, -70],  [41, -72],  [40, -74],
  [38, -75],  [35, -76],  [32, -80],  [30, -81],  [27, -80],
  [25, -80],
  // Florida tip → Gulf Coast
  [25, -82],  [27, -83],  [29, -89],  [30, -90],  [29, -94],
  // Texas → Mexico
  [27, -97],  [24, -98],  [22, -98],  [20, -96],  [18, -96],
  [17, -92],  [16, -88],
  // Central America
  [15, -84],  [13, -84],  [10, -84],  [9, -79],
  // Panama → back up Pacific side
  [9, -80],   [10, -86],  [14, -90],  [16, -96],
  [18, -105], [21, -105], [23, -110], [28, -112],
  [31, -117], [33, -117],
  // US West Coast
  [35, -121], [37, -122], [40, -124], [43, -124],
  [46, -124], [48, -125],
  // BC → Alaska panhandle
  [51, -128], [54, -133], [57, -136], [59, -140],
  [60, -147], [61, -150], [63, -153], [64, -163], [66, -166],
  [68, -165],
];

const greenland = [
  [76, -70], [78, -66], [80, -56], [82, -46], [83, -38],
  [83, -28], [81, -20], [78, -18], [76, -20], [73, -22],
  [70, -26], [68, -34], [66, -42], [65, -48], [65, -53],
  [67, -56], [70, -56], [73, -58], [75, -64],
];

const southAmerica = [
  [12, -72],  [11, -68],  [10, -66],  [8, -62],   [7, -58],
  [5, -53],   [3, -50],   [0, -49],   [-3, -42],  [-5, -36],
  [-7, -35],  [-10, -37], [-13, -39], [-16, -39], [-20, -40],
  [-23, -42], [-25, -48], [-28, -49], [-30, -51], [-33, -52],
  [-36, -57], [-40, -62], [-43, -65], [-46, -67], [-49, -66],
  [-51, -69], [-53, -70], [-55, -68], [-54, -65],
  // back up Chilean coast
  [-52, -72], [-48, -76], [-44, -74], [-40, -73], [-37, -74],
  [-33, -72], [-30, -71], [-27, -71], [-23, -70], [-18, -71],
  [-15, -75], [-12, -77], [-8, -80],  [-5, -81],  [-2, -80],
  [0, -78],   [3, -77],   [6, -77],   [9, -76],   [11, -75],
];

const europePeninsula = [
  // Northern Scandinavia → down the Norwegian coast
  [71, 28],  [70, 22],  [68, 16],  [65, 14],  [63, 10],
  [62, 5],   [60, 5],   [58, 8],
  // Denmark / Germany / Netherlands
  [56, 10],  [55, 8],   [54, 8],   [53, 5],   [52, 4],
  [51, 3],
  // France Atlantic
  [49, -1],  [48, -5],  [47, -4],  [46, -2],
  // Iberia
  [44, -1],  [43, -9],  [42, -9],  [39, -9],  [37, -9],
  [36, -6],  [36, -5],
  // Med coast → Italy boot
  [37, -2],  [38, 0],   [41, 2],   [43, 5],
  [44, 8],   [44, 10],  [43, 12],  [42, 14],  [41, 15],
  [40, 16],  [38, 16],  [38, 13],  [40, 18],
  // Balkans / Greece
  [37, 22],  [38, 24],  [40, 26],  [41, 29],
  // Black Sea north coast
  [43, 28],  [44, 32],  [46, 34],  [46, 38],
  // Eastern Europe
  [48, 40],  [50, 40],  [54, 40],  [56, 38],  [58, 34],
  [60, 30],  [63, 28],  [65, 26],  [68, 30],  [70, 30],
];

const britishIsles = [
  [58, -5],  [57, -2],  [55, 0],   [53, 0],   [52, -1],
  [51, 1],   [51, -1],  [50, -5],  [52, -5],  [53, -3],
  [54, -5],  [56, -6],  [58, -5],
];

const africaMain = [
  // NW Morocco → Mediterranean
  [36, -5],  [36, -1],  [37, 3],   [37, 10],
  // Tunisia → Libya → Egypt
  [34, 10],  [33, 12],  [32, 16],  [32, 22],  [31, 28],
  [31, 32],
  // Suez → Red Sea
  [30, 33],  [28, 34],  [24, 37],  [20, 38],
  // Horn of Africa
  [15, 42],  [12, 44],  [11, 48],  [10, 51],  [5, 46],
  [2, 42],   [0, 42],
  // East coast south
  [-2, 41],  [-5, 40],  [-8, 40],  [-11, 40], [-15, 41],
  [-20, 36], [-25, 35], [-28, 33],
  // Southern Africa
  [-31, 30], [-34, 26], [-35, 20], [-34, 18],
  // West coast north
  [-30, 16], [-25, 14], [-20, 13], [-15, 12],
  [-10, 14], [-5, 10],  [0, 5],    [5, 1],
  [5, -3],   [7, -8],   [8, -14],
  // Bulge of West Africa
  [10, -16], [12, -17], [15, -17], [18, -16],
  [21, -17], [24, -15], [28, -13], [30, -10],
  [33, -7],  [35, -5],
];

const madagascar = [
  [-13, 49], [-16, 50], [-19, 45], [-22, 44], [-25, 47],
  [-24, 44], [-21, 43], [-17, 44], [-13, 49],
];

const asiaMain = [
  // West: Turkey / Levant
  [42, 28],  [42, 32],  [40, 34],  [38, 36],  [37, 36],
  [35, 36],  [33, 36],  [31, 35],
  // Arabian Peninsula
  [30, 35],  [28, 34],  [26, 36],  [24, 38],  [20, 40],
  [16, 43],  [13, 45],  [12, 44],
  // Aden → Arabian Sea
  [14, 50],  [18, 56],  [22, 59],  [25, 57],  [26, 56],
  // Persian Gulf / Iran
  [27, 52],  [28, 50],  [26, 58],  [25, 62],  [25, 66],
  // Pakistan / India west coast
  [24, 68],  [22, 70],  [20, 73],  [18, 73],  [15, 74],
  [12, 75],  [10, 76],  [8, 77],
  // Sri Lanka tip → east coast India
  [8, 80],   [10, 80],  [13, 80],  [16, 82],  [19, 85],
  [21, 88],  [22, 90],
  // Bangladesh → Myanmar → Thailand
  [20, 93],  [18, 95],  [16, 98],  [14, 99],  [10, 99],
  [7, 100],  [5, 103],  [2, 104],  [1, 104],
  // Malay Peninsula
  [1, 104],  [3, 102],  [7, 100],  [10, 100],
  // Indochina
  [12, 105], [15, 108], [18, 106], [21, 108], [22, 110],
  // China coast
  [24, 114], [26, 118], [28, 121], [30, 122], [32, 122],
  [34, 120], [36, 122],
  // Korea / NE China
  [38, 122], [40, 122], [42, 130],
  // Russia Far East
  [44, 133], [46, 138], [50, 140], [53, 143],
  // Kamchatka
  [56, 158], [58, 162], [60, 163], [62, 168], [64, 176],
  [66, 180],
  // Chukotka → Arctic Siberia coast west
  [68, 178], [70, 175], [72, 168], [73, 155], [73, 145],
  [73, 135], [74, 122], [74, 110], [74, 100],
  [73, 90],  [72, 80],  [71, 68],  [69, 60],
  // Urals → Caspian
  [66, 56],  [62, 50],  [58, 50],  [55, 45],  [52, 42],
  [48, 38],  [45, 37],  [43, 35],  [42, 30],
];

const japan = [
  // Simplified Honshu+Hokkaido
  [44, 145], [43, 142], [41, 140], [39, 140],
  [37, 137], [35, 135], [33, 132], [32, 131],
  [33, 130], [34, 133], [35, 136], [37, 140],
  [40, 140], [42, 143], [44, 145],
];

const indonesia = [
  // Sumatra
  [-5, 105], [-3, 104], [2, 99],   [5, 96],
  [5, 98],   [2, 101],  [-2, 105], [-5, 106],
];

const newZealand = [
  [-35, 174], [-37, 176], [-39, 178], [-42, 174],
  [-46, 168], [-45, 167], [-43, 170], [-40, 173],
  [-37, 175], [-35, 174],
];

const australiaMain = [
  // Darwin → Cape York
  [-12, 131], [-12, 136], [-14, 137], [-15, 141],
  // East coast
  [-16, 146], [-19, 147], [-21, 149], [-24, 152],
  [-27, 153], [-30, 153], [-33, 152], [-35, 151],
  [-37, 150], [-38, 148],
  // Melbourne → Adelaide
  [-39, 146], [-38, 142], [-37, 140], [-36, 137],
  [-34, 137], [-33, 134],
  // South coast → WA
  [-32, 131], [-32, 128], [-33, 122], [-34, 118],
  [-35, 116], [-33, 115], [-31, 115],
  // West coast north
  [-28, 114], [-24, 113], [-22, 114], [-20, 119],
  [-17, 122], [-15, 126], [-13, 128], [-12, 131],
];

// ─── Antarctica as an annular ring ───
// On the Gleason map it's the icy band at the outer edge.
// We'll produce a thick, slightly-irregular band using two near-circular rings.
function antarcticaRing() {
  const outerR = 385;
  const n      = 60;
  let d        = "";

  // Outer ring (clockwise)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const jitter = 2 + 4 * Math.sin(a * 5);          // slight wobble
    const r = outerR + jitter;
    const x = CX + r * Math.sin(a);
    const y = CY - r * Math.cos(a);
    d += `${i === 0 ? "M" : "L"}${(x).toFixed(1)},${(y).toFixed(1)} `;
  }
  d += "Z ";

  // Inner ring (counter-clockwise for cut-out)
  const innerR = 340;
  for (let i = n - 1; i >= 0; i--) {
    const a = (i / n) * 2 * Math.PI;
    const jitter = 3 * Math.sin(a * 7);
    const r = innerR + jitter;
    const x = CX + r * Math.sin(a);
    const y = CY - r * Math.cos(a);
    d += `${i === n - 1 ? "M" : "L"}${(x).toFixed(1)},${(y).toFixed(1)} `;
  }
  d += "Z";
  return d;
}

/* ───────── output ───────── */

const groups = [
  { name: "North America", paths: [northAmericaMain, greenland] },
  { name: "South America", paths: [southAmerica] },
  { name: "Europe",        paths: [europePeninsula, britishIsles] },
  { name: "Africa",        paths: [africaMain, madagascar] },
  { name: "Asia",          paths: [asiaMain, japan, indonesia] },
  { name: "Australia",     paths: [australiaMain, newZealand] },
];

for (const { name, paths } of groups) {
  const d = paths.map(p => toPath(p)).join(" ");
  console.log(`            <g class="continent" data-name="${name}" tabindex="0">`);
  console.log(`              <path d="${d}" />`);
  console.log(`            </g>`);
}

// Antarctica
console.log(`            <g class="continent" data-name="Antarctica" tabindex="0">`);
console.log(`              <path d="${antarcticaRing()}" fill-rule="evenodd" />`);
console.log(`            </g>`);
