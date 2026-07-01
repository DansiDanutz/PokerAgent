const sharp = require("sharp");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "public");

const GOLD_FROM = "#f3d89b";
const GOLD_TO = "#d4af37";
const BG = "#0e1813";

// Spade path authored in a 32x32 box (from src/app/icon.svg), reused at scale.
const SPADE_PATH =
  "M16 5c-4 5.3-10.7 8.6-10.7 14.6A5.3 5.3 0 0 0 14 23.8c-.3 2.3-1.2 3.9-2.6 5.2h9.1c-1.3-1.3-2.3-2.9-2.6-5.2a5.3 5.3 0 0 0 8.7-4.2C26.7 13.6 20 10.3 16 5Z";

function iconSvg({ size, cornerRadiusFrac, contentScale }) {
  const r = Math.round(size * cornerRadiusFrac);
  const contentSize = size * contentScale;
  const offset = (size - contentSize) / 2;
  const scale = contentSize / 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${BG}"/>
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GOLD_FROM}"/>
      <stop offset="1" stop-color="${GOLD_TO}"/>
    </linearGradient>
  </defs>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <path fill="url(#g)" d="${SPADE_PATH}"/>
  </g>
</svg>`;
}

async function main() {
  const targets = [
    { file: "icon-192.png", size: 192, cornerRadiusFrac: 0.22, contentScale: 0.86 },
    { file: "icon-512.png", size: 512, cornerRadiusFrac: 0.22, contentScale: 0.86 },
    // Maskable: background must be edge-to-edge (no rounded corners — the OS
    // applies its own mask shape), content kept inside the ~80% safe zone.
    { file: "icon-512-maskable.png", size: 512, cornerRadiusFrac: 0, contentScale: 0.62 },
    { file: "apple-touch-icon.png", size: 180, cornerRadiusFrac: 0.22, contentScale: 0.86 },
  ];

  for (const t of targets) {
    const svg = iconSvg(t);
    await sharp(Buffer.from(svg)).png().toFile(`${OUT_DIR}/${t.file}`);
    console.log("wrote", t.file);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
