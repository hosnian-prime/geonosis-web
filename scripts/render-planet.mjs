#!/usr/bin/env node
/**
 * Renders the procedural Geonosis planet to a PNG file.
 * Uses the same Perlin-noise terrain logic as PlanetCanvas.astro.
 *
 * Usage: node scripts/render-planet.mjs [size] [output]
 *   size   – canvas dimension in px (default 1024)
 *   output – output path (default public/planet.png)
 */
import { createCanvas } from 'canvas';
import { writeFileSync } from 'node:fs';

const size = Number(process.argv[2]) || 1024;
const outPath = process.argv[3] || 'public/planet.png';

const canvas = createCanvas(size, size);
const ctx = canvas.getContext('2d');

// ── Permutation table ──
const perm = new Uint8Array(512);
const p = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
for (let i = 0; i < 256; i++) { perm[i] = perm[i + 256] = p[i]; }

function grad(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function lerp(t, a, b) { return a + t * (b - a); }

function perlin(x, y, z) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = x * x * x * (x * (x * 6 - 15) + 10);
  const v = y * y * y * (y * (y * 6 - 15) + 10);
  const w = z * z * z * (z * (z * 6 - 15) + 10);
  const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
  const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
  return lerp(w,
    lerp(v,
      lerp(u, grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z)),
      lerp(u, grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z))
    ),
    lerp(v,
      lerp(u, grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1)),
      lerp(u, grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1))
    )
  );
}

function fbm(x, y, z, octaves) {
  let value = 0, amplitude = 0.5, frequency = 1;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * perlin(x * frequency, y * frequency, z * frequency);
    frequency *= 2.1;
    amplitude *= 0.47;
  }
  return value;
}

// ── Planet colors ──
const colors = [
  [40, 18, 8],
  [85, 40, 16],
  [150, 82, 32],
  [200, 110, 40],
  [235, 150, 60],
  [160, 60, 24],
];

function getTerrainColor(height) {
  const stops = [0, 0.2, 0.4, 0.6, 0.78, 0.92];
  let i = 0;
  for (; i < stops.length - 1; i++) {
    if (height < stops[i + 1]) break;
  }
  i = Math.min(i, colors.length - 2);
  const t = (height - stops[i]) / (stops[i + 1] - stops[i]);
  const c0 = colors[i], c1 = colors[i + 1];
  return [
    c0[0] + t * (c1[0] - c0[0]),
    c0[1] + t * (c1[1] - c0[1]),
    c0[2] + t * (c1[2] - c0[2]),
  ];
}

// ── Render ──
const cx = size / 2;
const cy = size / 2;
const radius = size * 0.4;
const rotation = 0.8; // Fixed angle that looks good

const imageData = ctx.createImageData(size, size);
const data = imageData.data;

const lx = 0.6, ly = -0.3, lz = 0.74;
const lLen = Math.sqrt(lx * lx + ly * ly + lz * lz);
const lightX = lx / lLen, lightY = ly / lLen, lightZ = lz / lLen;

for (let py = 0; py < size; py++) {
  for (let px = 0; px < size; px++) {
    const dx = px - cx;
    const dy = py - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > radius + 2) continue;

    const idx = (py * size + px) * 4;

    if (dist > radius) {
      const alpha = Math.max(0, 1 - (dist - radius) / 2);
      data[idx + 3] = alpha * 255;
      continue;
    }

    const nx = dx / radius;
    const ny = dy / radius;
    const nzSq = 1 - nx * nx - ny * ny;
    if (nzSq < 0) continue;
    const nz = Math.sqrt(nzSq);

    const theta = Math.atan2(nx, nz) + rotation;
    const phi = Math.asin(ny);
    const u = theta / Math.PI;
    const v = phi / (Math.PI / 2);

    const n = fbm(u * 3, v * 3, 0.5, 6) * 0.5 + 0.5;
    const detail = perlin(u * 12, v * 12, rotation * 0.3) * 0.15;
    const height = Math.max(0, Math.min(1, n + detail));

    let [r, g, b] = getTerrainColor(height);

    const NdotL = nx * lightX + ny * lightY + nz * lightZ;
    const diffuse = Math.max(NdotL, 0);
    const ambient = 0.12;
    const wrap = Math.max(NdotL * 0.5 + 0.5, 0);
    const light = ambient + diffuse * 0.7 + wrap * 0.15;

    const hx = lightX, hy = lightY, hz = lightZ + 1;
    const hLen = Math.sqrt(hx * hx + hy * hy + hz * hz);
    const NdotH = (nx * hx + ny * hy + nz * hz) / hLen;
    const spec = Math.pow(Math.max(NdotH, 0), 20) * 0.2;

    r = r * light + spec * 255;
    g = g * light + spec * 200;
    b = b * light + spec * 150;

    const fresnel = Math.pow(1 - nz, 3.5);
    r += fresnel * 255 * 0.4;
    g += fresnel * 120 * 0.4;
    b += fresnel * 40 * 0.4;

    const edgeFade = dist / radius;
    const edgeDarken = edgeFade > 0.92 ? 1 - (edgeFade - 0.92) / 0.08 : 1;

    data[idx] = Math.min(255, r * edgeDarken);
    data[idx + 1] = Math.min(255, g * edgeDarken);
    data[idx + 2] = Math.min(255, b * edgeDarken);
    data[idx + 3] = 255;
  }
}

ctx.putImageData(imageData, 0, 0);

// Atmosphere glow ring
const gradient = ctx.createRadialGradient(cx, cy, radius * 0.95, cx, cy, radius * 1.15);
gradient.addColorStop(0, 'rgba(255, 94, 26, 0.25)');
gradient.addColorStop(0.5, 'rgba(255, 60, 10, 0.1)');
gradient.addColorStop(1, 'rgba(255, 40, 5, 0)');
ctx.beginPath();
ctx.arc(cx, cy, radius * 1.15, 0, Math.PI * 2);
ctx.fillStyle = gradient;
ctx.fill();

// Save
const buf = canvas.toBuffer('image/png');
writeFileSync(outPath, buf);
console.log(`Planet rendered → ${outPath} (${size}×${size}, ${(buf.length / 1024).toFixed(0)} KB)`);
