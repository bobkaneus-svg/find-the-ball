const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Database = require('better-sqlite3');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ORIGINALS_DIR = path.join(PROJECT_ROOT, 'public', 'photos', 'originals');
const MODIFIED_DIR = path.join(PROJECT_ROOT, 'public', 'photos', 'modified');
const DB_PATH = path.join(PROJECT_ROOT, 'data', 'findtheball.db');

// Unsplash photo URLs
const PHOTO_URLS = [
  'https://images.unsplash.com/photo-1553778263-73a83bab9b0c?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1511886929837-354d827aae26?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=800&h=600&fit=crop',
];

// Fallback coordinates (percentage) if detection fails
const FALLBACK_COORDS = [
  { ball_x: 48, ball_y: 65, ball_radius: 20, difficulty: 'easy',   description: 'Football field aerial view' },
  { ball_x: 42, ball_y: 58, ball_radius: 22, difficulty: 'medium', description: 'Soccer match in progress' },
  { ball_x: 55, ball_y: 72, ball_radius: 25, difficulty: 'medium', description: 'Soccer player kicking the ball' },
  { ball_x: 62, ball_y: 70, ball_radius: 28, difficulty: 'easy',   description: 'Football player with the ball' },
  { ball_x: 45, ball_y: 55, ball_radius: 30, difficulty: 'easy',   description: 'Soccer ball on the field' },
  { ball_x: 50, ball_y: 80, ball_radius: 18, difficulty: 'hard',   description: 'Stadium panoramic view' },
  { ball_x: 38, ball_y: 62, ball_radius: 24, difficulty: 'medium', description: 'Football match action shot' },
  { ball_x: 58, ball_y: 68, ball_radius: 26, difficulty: 'medium', description: 'Soccer player dribbling' },
];

// Ensure directories exist
fs.mkdirSync(ORIGINALS_DIR, { recursive: true });
fs.mkdirSync(MODIFIED_DIR, { recursive: true });

// ─── Download helper ───────────────────────────────────────────────────────────

function downloadFile(url, destPath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const request = protocol.get(url, { timeout: 20000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
        return downloadFile(res.headers.location, destPath, maxRedirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(true); });
      file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    });
    request.on('error', reject);
    request.on('timeout', () => { request.destroy(); reject(new Error('Timeout')); });
  });
}

// ─── SVG fallback generator ────────────────────────────────────────────────────

function generateFallbackSVG(index) {
  // Each scene has a football-field setting with a clearly placed white ball
  const scenes = [
    // 0 - Wide field, ball near center circle
    { ballCx: 400, ballCy: 350, ballR: 16, sky: '#4a90d9', grass1: '#2d8a4e', grass2: '#35a05a',
      extras: `
        <line x1="400" y1="250" x2="400" y2="600" stroke="white" stroke-width="2" opacity="0.5"/>
        <circle cx="400" cy="420" r="70" stroke="white" stroke-width="2" fill="none" opacity="0.4"/>
        <rect x="0" y="250" width="800" height="4" fill="white" opacity="0.5"/>
        <g transform="translate(320,300)" fill="#c0392b"><ellipse cx="0" cy="0" rx="10" ry="15"/><rect x="-5" y="15" width="10" height="28" rx="3"/><rect x="-4" y="43" width="4" height="22" rx="1"/><rect x="0" y="43" width="4" height="22" rx="1"/></g>
        <g transform="translate(470,310)" fill="#2c3e50"><ellipse cx="0" cy="0" rx="10" ry="15"/><rect x="-5" y="15" width="10" height="28" rx="3"/><rect x="-4" y="43" width="4" height="22" rx="1"/><rect x="0" y="43" width="4" height="22" rx="1"/></g>`},
    // 1 - Match scene, ball lower right
    { ballCx: 520, ballCy: 400, ballR: 14, sky: '#5b9bd5', grass1: '#1e7a3a', grass2: '#28924a',
      extras: `
        <rect x="0" y="280" width="800" height="4" fill="white" opacity="0.4"/>
        <rect x="600" y="300" width="180" height="120" stroke="white" stroke-width="2" fill="none" opacity="0.5"/>
        <g transform="translate(450,320)" fill="#e74c3c"><ellipse cx="0" cy="0" rx="10" ry="14"/><rect x="-5" y="14" width="10" height="26" rx="3"/><rect x="-4" y="40" width="4" height="22" rx="1"/><rect x="0" y="40" width="4" height="22" rx="1"/></g>
        <g transform="translate(560,330)" fill="#1a237e"><ellipse cx="0" cy="0" rx="10" ry="14"/><rect x="-5" y="14" width="10" height="26" rx="3"/><rect x="-4" y="40" width="4" height="22" rx="1"/><rect x="0" y="40" width="4" height="22" rx="1"/></g>`},
    // 2 - Close action, ball at feet
    { ballCx: 350, ballCy: 440, ballR: 18, sky: '#6ba3d6', grass1: '#2a8545', grass2: '#32994f',
      extras: `
        <rect x="0" y="300" width="800" height="4" fill="white" opacity="0.4"/>
        <circle cx="400" cy="450" r="60" stroke="white" stroke-width="2" fill="none" opacity="0.3"/>
        <g transform="translate(330,310)" fill="#8e44ad"><ellipse cx="0" cy="0" rx="14" ry="20"/><rect x="-8" y="20" width="16" height="38" rx="4"/><rect x="-7" y="58" width="6" height="32" rx="2"/><rect x="1" y="58" width="6" height="32" rx="2"/></g>`},
    // 3 - Goal scene, ball near post
    { ballCx: 250, ballCy: 380, ballR: 15, sky: '#87CEEB', grass1: '#228B22', grass2: '#2ca62c',
      extras: `
        <rect x="100" y="260" width="250" height="160" stroke="white" stroke-width="3" fill="none" opacity="0.7"/>
        <line x1="100" y1="260" x2="150" y2="230" stroke="white" stroke-width="2" opacity="0.6"/>
        <line x1="350" y1="260" x2="300" y2="230" stroke="white" stroke-width="2" opacity="0.6"/>
        <line x1="150" y1="230" x2="300" y2="230" stroke="white" stroke-width="2" opacity="0.6"/>
        <rect x="0" y="310" width="800" height="4" fill="white" opacity="0.4"/>
        <g transform="translate(300,290)" fill="#c0392b"><ellipse cx="0" cy="0" rx="11" ry="16"/><rect x="-6" y="16" width="12" height="30" rx="3"/><rect x="-5" y="46" width="5" height="25" rx="2"/><rect x="0" y="46" width="5" height="25" rx="2"/></g>`},
    // 4 - Ball on grass close-up
    { ballCx: 380, ballCy: 340, ballR: 26, sky: '#78B7D0', grass1: '#1e8c3a', grass2: '#25a045',
      extras: `
        <line x1="0" y1="280" x2="800" y2="280" stroke="white" stroke-width="3" opacity="0.6"/>
        <line x1="200" y1="280" x2="200" y2="600" stroke="white" stroke-width="2" opacity="0.3"/>`},
    // 5 - Stadium wide shot, ball far
    { ballCx: 410, ballCy: 490, ballR: 10, sky: '#4682B4', grass1: '#1a7535', grass2: '#208c40',
      extras: `
        <rect x="50" y="200" width="700" height="150" fill="#555" opacity="0.5"/>
        <rect x="0" y="360" width="800" height="3" fill="white" opacity="0.5"/>
        <line x1="400" y1="360" x2="400" y2="600" stroke="white" stroke-width="2" opacity="0.3"/>
        <circle cx="400" cy="480" r="50" stroke="white" stroke-width="2" fill="none" opacity="0.3"/>
        <rect x="20" y="390" width="120" height="80" stroke="white" stroke-width="2" fill="none" opacity="0.4"/>
        <rect x="660" y="390" width="120" height="80" stroke="white" stroke-width="2" fill="none" opacity="0.4"/>`},
    // 6 - Multiple players
    { ballCx: 310, ballCy: 420, ballR: 12, sky: '#5DADE2', grass1: '#27ae60', grass2: '#2ecc71',
      extras: `
        <rect x="0" y="310" width="800" height="4" fill="white" opacity="0.4"/>
        <g transform="translate(200,270)" fill="#e74c3c"><ellipse cx="0" cy="0" rx="9" ry="13"/><rect x="-4" y="13" width="8" height="24" rx="2"/><rect x="-3" y="37" width="3" height="20" rx="1"/><rect x="0" y="37" width="3" height="20" rx="1"/></g>
        <g transform="translate(340,280)" fill="#2c3e50"><ellipse cx="0" cy="0" rx="9" ry="13"/><rect x="-4" y="13" width="8" height="24" rx="2"/><rect x="-3" y="37" width="3" height="20" rx="1"/><rect x="0" y="37" width="3" height="20" rx="1"/></g>
        <g transform="translate(260,260)" fill="#2c3e50"><ellipse cx="0" cy="0" rx="9" ry="13"/><rect x="-4" y="13" width="8" height="24" rx="2"/><rect x="-3" y="37" width="3" height="20" rx="1"/><rect x="0" y="37" width="3" height="20" rx="1"/></g>`},
    // 7 - Dribbling player
    { ballCx: 465, ballCy: 420, ballR: 14, sky: '#85C1E9', grass1: '#229940', grass2: '#2ab34d',
      extras: `
        <rect x="0" y="330" width="800" height="3" fill="white" opacity="0.4"/>
        <g transform="translate(400,250)" fill="#8e44ad"><ellipse cx="0" cy="0" rx="14" ry="20"/><rect x="-8" y="20" width="16" height="38" rx="4"/><rect x="-24" y="26" width="16" height="5" rx="2" transform="rotate(-25,-24,28)"/><rect x="8" y="26" width="18" height="5" rx="2" transform="rotate(15,8,28)"/><rect x="-7" y="58" width="6" height="32" rx="2"/><rect x="1" y="58" width="6" height="32" rx="2"/></g>`},
  ];

  const s = scenes[index];

  // Grass stripes
  let stripes = '';
  const grassStart = 280;
  for (let y = grassStart; y < 600; y += 25) {
    const c = (Math.floor((y - grassStart) / 25) % 2 === 0) ? s.grass1 : s.grass2;
    stripes += `<rect x="0" y="${y}" width="800" height="25" fill="${c}"/>`;
  }

  // Pentagon pattern on the ball for realism
  const bx = s.ballCx, by = s.ballCy, br = s.ballR;

  return {
    svg: `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${s.sky}"/>
      <stop offset="100%" stop-color="#c8dde8"/>
    </linearGradient>
    <radialGradient id="ballGrad" cx="40%" cy="35%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="80%" stop-color="#e8e8e8"/>
      <stop offset="100%" stop-color="#cccccc"/>
    </radialGradient>
  </defs>
  <rect width="800" height="600" fill="url(#sky)"/>
  ${stripes}
  ${s.extras}
  <circle cx="${bx}" cy="${by}" r="${br}" fill="url(#ballGrad)" stroke="#aaa" stroke-width="1.5"/>
  <circle cx="${bx}" cy="${by}" r="${br * 0.35}" fill="none" stroke="#555" stroke-width="1" opacity="0.6"/>
</svg>`,
    ballCx: bx, ballCy: by, ballR: br
  };
}

// ─── Ball detection via pixel analysis ─────────────────────────────────────────
// Strategy: find circular bright regions that have a CONTRAST boundary.
// A real ball is bright inside but surrounded by darker pixels (grass, field).
// Sky/clouds are bright everywhere with no boundary -> low contrast score.

async function detectBall(imagePath) {
  const { data, info } = await sharp(imagePath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;

  function brightness(px, py) {
    if (px < 0 || px >= width || py < 0 || py >= height) return 0;
    const idx = (py * width + px) * channels;
    return (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
  }

  function isBright(px, py) {
    if (px < 0 || px >= width || py < 0 || py >= height) return false;
    const idx = (py * width + px) * channels;
    return data[idx] > 190 && data[idx + 1] > 190 && data[idx + 2] > 190;
  }

  const STEP = 8;
  const MIN_RADIUS = 10;
  const MAX_RADIUS = 45;

  let bestX = -1, bestY = -1, bestRadius = 20, bestScore = 0;
  const candidates = [];

  // Grid scan - look for bright circular blobs with contrast to surroundings
  for (let cy = MAX_RADIUS + 10; cy < height - MAX_RADIUS - 10; cy += STEP) {
    for (let cx = MAX_RADIUS + 10; cx < width - MAX_RADIUS - 10; cx += STEP) {
      for (let r = MIN_RADIUS; r <= MAX_RADIUS; r += 5) {
        let innerBright = 0, innerTotal = 0;
        let outerBright = 0, outerTotal = 0;
        let innerBrightnessSum = 0;
        let outerBrightnessSum = 0;

        // Sample inside circle
        for (let dy = -r; dy <= r; dy += 3) {
          for (let dx = -r; dx <= r; dx += 3) {
            const dist2 = dx * dx + dy * dy;
            const px = cx + dx, py = cy + dy;
            if (px < 0 || px >= width || py < 0 || py >= height) continue;

            if (dist2 <= r * r) {
              // Inside
              innerTotal++;
              innerBrightnessSum += brightness(px, py);
              if (isBright(px, py)) innerBright++;
            }
          }
        }

        // Sample the ring just outside the circle (1.0r to 1.8r)
        const outerR = Math.round(r * 1.8);
        for (let dy = -outerR; dy <= outerR; dy += 4) {
          for (let dx = -outerR; dx <= outerR; dx += 4) {
            const dist2 = dx * dx + dy * dy;
            if (dist2 <= r * r || dist2 > outerR * outerR) continue;
            const px = cx + dx, py = cy + dy;
            if (px < 0 || px >= width || py < 0 || py >= height) continue;
            outerTotal++;
            outerBrightnessSum += brightness(px, py);
            if (isBright(px, py)) outerBright++;
          }
        }

        if (innerTotal < 5 || outerTotal < 5) continue;

        const innerDensity = innerBright / innerTotal;
        const outerDensity = outerBright / outerTotal;
        const innerAvgBrightness = innerBrightnessSum / innerTotal;
        const outerAvgBrightness = outerBrightnessSum / outerTotal;

        // Contrast: inside should be much brighter than outside
        const contrastRatio = innerAvgBrightness / (outerAvgBrightness + 1);
        const densityContrast = innerDensity - outerDensity;

        // Good ball candidate: bright inside (>50%), dark outside, strong contrast
        if (innerDensity < 0.4) continue;
        if (densityContrast < 0.15) continue; // Must have visible boundary

        // Score: density contrast * inner brightness, prefer moderate radii
        const radiusPenalty = (r < 12 || r > 40) ? 0.7 : 1.0;
        // Prefer lower positions (balls are usually on the field, not in sky)
        const yBonus = (cy / height > 0.25) ? 1.2 : 0.6;
        const score = densityContrast * innerDensity * contrastRatio * radiusPenalty * yBonus;

        if (score > bestScore) {
          bestScore = score;
          bestX = cx;
          bestY = cy;
          bestRadius = r;
        }

        if (score > 0.3) {
          candidates.push({ x: cx, y: cy, r, score, innerDensity, outerDensity, densityContrast });
        }
      }
    }
  }

  // Refine around best candidate with finer step
  if (bestX > 0) {
    const refineRange = 12;
    const origBestX = bestX, origBestY = bestY, origBestR = bestRadius;
    for (let cy = origBestY - refineRange; cy <= origBestY + refineRange; cy += 2) {
      for (let cx = origBestX - refineRange; cx <= origBestX + refineRange; cx += 2) {
        for (let r = Math.max(MIN_RADIUS, origBestR - 6); r <= Math.min(MAX_RADIUS, origBestR + 6); r += 2) {
          if (cx - r < 5 || cx + r >= width - 5 || cy - r < 5 || cy + r >= height - 5) continue;

          let innerBright = 0, innerTotal = 0, innerBSum = 0;
          let outerBright = 0, outerTotal = 0, outerBSum = 0;
          const outerR = Math.round(r * 1.8);

          for (let dy = -outerR; dy <= outerR; dy += 2) {
            for (let dx = -outerR; dx <= outerR; dx += 2) {
              const dist2 = dx * dx + dy * dy;
              const px = cx + dx, py = cy + dy;
              if (px < 0 || px >= width || py < 0 || py >= height) continue;

              if (dist2 <= r * r) {
                innerTotal++;
                innerBSum += brightness(px, py);
                if (isBright(px, py)) innerBright++;
              } else if (dist2 <= outerR * outerR) {
                outerTotal++;
                outerBSum += brightness(px, py);
                if (isBright(px, py)) outerBright++;
              }
            }
          }

          if (innerTotal < 5 || outerTotal < 5) continue;
          const innerDensity = innerBright / innerTotal;
          const outerDensity = outerBright / outerTotal;
          const densityContrast = innerDensity - outerDensity;
          const contrastRatio = (innerBSum / innerTotal) / ((outerBSum / outerTotal) + 1);

          if (innerDensity < 0.4 || densityContrast < 0.15) continue;

          const radiusPenalty = (r < 12 || r > 40) ? 0.7 : 1.0;
          const yBonus = (cy / height > 0.25) ? 1.2 : 0.6;
          const score = densityContrast * innerDensity * contrastRatio * radiusPenalty * yBonus;

          if (score > bestScore) {
            bestScore = score;
            bestX = cx;
            bestY = cy;
            bestRadius = r;
          }
        }
      }
    }
  }

  const confidence = Math.min(bestScore, 1.0);
  const xPct = bestX >= 0 ? (bestX / width * 100) : -1;
  const yPct = bestY >= 0 ? (bestY / height * 100) : -1;

  return {
    found: bestX >= 0 && bestScore > 0.3,
    x: bestX, y: bestY, radius: bestRadius,
    xPct: Math.round(xPct * 100) / 100,
    yPct: Math.round(yPct * 100) / 100,
    confidence: Math.round(confidence * 1000) / 1000,
    width, height,
    candidateCount: candidates.length
  };
}

// ─── Ball erasure with proper compositing ──────────────────────────────────────

async function eraseBall(inputPath, outputPath, ballCx, ballCy, ballRadius, imgWidth, imgHeight) {
  const radius = Math.max(ballRadius, 12);
  const patchRadius = Math.round(radius * 2.5);
  const patchSize = patchRadius * 2;

  // Clamp patch size to image
  const safePatchSize = Math.min(patchSize, imgWidth - 2, imgHeight - 2);

  // Sample 4 directions to find best offset for source patch
  const { data: rawData, info: rawInfo } = await sharp(inputPath).raw().toBuffer({ resolveWithObject: true });
  const ch = rawInfo.channels;

  function avgColor(cx, cy, r) {
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let dy = -r; dy <= r; dy += 3) {
      for (let dx = -r; dx <= r; dx += 3) {
        if (dx * dx + dy * dy > r * r) continue;
        const px = cx + dx, py = cy + dy;
        if (px < 0 || px >= imgWidth || py < 0 || py >= imgHeight) continue;
        const idx = (py * imgWidth + px) * ch;
        rSum += rawData[idx]; gSum += rawData[idx + 1]; bSum += rawData[idx + 2];
        count++;
      }
    }
    if (count === 0) return { r: 128, g: 128, b: 128 };
    return { r: rSum / count, g: gSum / count, b: bSum / count };
  }

  // Get color of the ring around the ball (the surrounding area we want to match)
  const surroundColor = avgColor(ballCx, ballCy, Math.round(radius * 1.8));

  // Test 4 offset directions
  const offsets = [
    { dx: 0, dy: -patchRadius * 1.5 },  // up
    { dx: 0, dy: patchRadius * 1.5 },    // down
    { dx: -patchRadius * 1.5, dy: 0 },   // left
    { dx: patchRadius * 1.5, dy: 0 },    // right
  ];

  let bestOffset = offsets[0];
  let bestDiff = Infinity;

  for (const off of offsets) {
    const sx = Math.round(ballCx + off.dx);
    const sy = Math.round(ballCy + off.dy);
    // Check if source region is in bounds
    if (sx - safePatchSize / 2 < 0 || sx + safePatchSize / 2 >= imgWidth ||
        sy - safePatchSize / 2 < 0 || sy + safePatchSize / 2 >= imgHeight) continue;

    const sampleColor = avgColor(sx, sy, Math.round(radius * 1.2));
    const diff = Math.abs(sampleColor.r - surroundColor.r) +
                 Math.abs(sampleColor.g - surroundColor.g) +
                 Math.abs(sampleColor.b - surroundColor.b);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestOffset = off;
    }
  }

  // Source patch center
  const srcCx = Math.round(Math.max(safePatchSize / 2, Math.min(imgWidth - safePatchSize / 2 - 1,
    ballCx + bestOffset.dx)));
  const srcCy = Math.round(Math.max(safePatchSize / 2, Math.min(imgHeight - safePatchSize / 2 - 1,
    ballCy + bestOffset.dy)));

  const extractLeft = Math.max(0, Math.round(srcCx - safePatchSize / 2));
  const extractTop = Math.max(0, Math.round(srcCy - safePatchSize / 2));
  const extractW = Math.min(safePatchSize, imgWidth - extractLeft);
  const extractH = Math.min(safePatchSize, imgHeight - extractTop);

  // Extract source patch and blur it slightly
  const patchBuf = await sharp(inputPath)
    .extract({ left: extractLeft, top: extractTop, width: extractW, height: extractH })
    .resize(safePatchSize, safePatchSize)
    .blur(3.5)
    .png()
    .toBuffer();

  // Create feathered circular mask with radialGradient for soft edges
  const maskCenter = Math.round(safePatchSize / 2);
  const maskRadius = Math.round(safePatchSize / 2);
  const maskSvg = Buffer.from(`<svg width="${safePatchSize}" height="${safePatchSize}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="white" stop-opacity="1"/>
      <stop offset="65%" stop-color="white" stop-opacity="1"/>
      <stop offset="100%" stop-color="black" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <rect width="${safePatchSize}" height="${safePatchSize}" fill="black"/>
  <circle cx="${maskCenter}" cy="${maskCenter}" r="${maskRadius}" fill="url(#g)"/>
</svg>`);

  // Apply the mask to the patch (patch visible only where mask is white)
  const maskedPatch = await sharp(patchBuf)
    .ensureAlpha()
    .composite([{
      input: await sharp(maskSvg).resize(safePatchSize, safePatchSize).grayscale().toBuffer(),
      blend: 'dest-in',
      raw: undefined,
    }])
    .png()
    .toBuffer();

  // Place the masked patch over the ball position
  const compLeft = Math.max(0, Math.round(ballCx - safePatchSize / 2));
  const compTop = Math.max(0, Math.round(ballCy - safePatchSize / 2));

  await sharp(inputPath)
    .composite([{
      input: maskedPatch,
      left: compLeft,
      top: compTop,
      blend: 'over'
    }])
    .jpeg({ quality: 92 })
    .toFile(outputPath);

  return { compLeft, compTop, patchSize: safePatchSize, offset: bestOffset };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Find the Ball v2 - Photo Processor ===\n');

  const results = [];

  for (let i = 0; i < PHOTO_URLS.length; i++) {
    const idx = String(i + 1).padStart(2, '0');
    const filename = `photo_${idx}.jpg`;
    const origPath = path.join(ORIGINALS_DIR, filename);
    const modPath = path.join(MODIFIED_DIR, filename);
    const fallback = FALLBACK_COORDS[i];
    let usedFallbackImage = false;
    let knownBallPx = null; // For SVG fallbacks where we know exact ball position

    console.log(`[${i + 1}/8] ${filename}`);

    // ── Step 1: Download ──
    console.log(`  Downloading from Unsplash...`);
    let downloaded = false;
    try {
      await downloadFile(PHOTO_URLS[i], origPath);
      const meta = await sharp(origPath).metadata();
      if (meta.width && meta.height) {
        downloaded = true;
        console.log(`    OK - ${meta.width}x${meta.height}`);
      }
    } catch (err) {
      console.log(`    FAILED: ${err.message}`);
    }

    if (!downloaded) {
      console.log(`  Generating SVG fallback image...`);
      try {
        const { svg, ballCx, ballCy, ballR } = generateFallbackSVG(i);
        await sharp(Buffer.from(svg))
          .resize(800, 600)
          .jpeg({ quality: 94 })
          .toFile(origPath);
        usedFallbackImage = true;
        knownBallPx = { x: ballCx, y: ballCy, radius: ballR };
        console.log(`    OK - SVG fallback (ball at ${ballCx},${ballCy} r=${ballR})`);
      } catch (err) {
        console.log(`    FAILED to create fallback: ${err.message}`);
        continue;
      }
    }

    // ── Step 2: Detect ball ──
    let ballInfo;
    const meta = await sharp(origPath).metadata();
    const imgW = meta.width || 800;
    const imgH = meta.height || 600;

    if (usedFallbackImage && knownBallPx) {
      // We know exactly where the ball is in SVG-generated images
      ballInfo = {
        found: true,
        x: knownBallPx.x, y: knownBallPx.y,
        radius: knownBallPx.radius,
        xPct: Math.round(knownBallPx.x / imgW * 10000) / 100,
        yPct: Math.round(knownBallPx.y / imgH * 10000) / 100,
        confidence: 0.99,
        width: imgW, height: imgH,
        source: 'svg-known'
      };
      console.log(`  Ball position: KNOWN from SVG - (${ballInfo.xPct}%, ${ballInfo.yPct}%) r=${ballInfo.radius} conf=${ballInfo.confidence}`);
    } else {
      console.log(`  Detecting ball via pixel analysis...`);
      ballInfo = await detectBall(origPath);

      if (ballInfo.found) {
        console.log(`    DETECTED at pixel (${ballInfo.x}, ${ballInfo.y}) = (${ballInfo.xPct}%, ${ballInfo.yPct}%) r=${ballInfo.radius} confidence=${ballInfo.confidence}`);
        ballInfo.source = 'detected';
      } else {
        console.log(`    Detection FAILED (confidence=${ballInfo.confidence}), using fallback coordinates`);
        ballInfo = {
          found: true,
          x: Math.round(fallback.ball_x * imgW / 100),
          y: Math.round(fallback.ball_y * imgH / 100),
          radius: fallback.ball_radius,
          xPct: fallback.ball_x,
          yPct: fallback.ball_y,
          confidence: 0.2,
          width: imgW, height: imgH,
          source: 'fallback'
        };
        console.log(`    Using fallback: (${ballInfo.xPct}%, ${ballInfo.yPct}%) r=${ballInfo.radius}`);
      }
    }

    // ── Step 3: Erase ball ──
    console.log(`  Erasing ball...`);
    try {
      const eraseResult = await eraseBall(
        origPath, modPath,
        ballInfo.x, ballInfo.y, ballInfo.radius,
        imgW, imgH
      );
      console.log(`    OK - patch at (${eraseResult.compLeft}, ${eraseResult.compTop}), size=${eraseResult.patchSize}`);
    } catch (err) {
      console.log(`    ERASURE FAILED: ${err.message}`);
      // Fallback: apply heavy blur over ball area
      try {
        console.log(`    Trying blur fallback...`);
        const blurRadius = Math.max(ballInfo.radius * 2, 30);
        const blurSize = blurRadius * 2;
        const bLeft = Math.max(0, ballInfo.x - blurRadius);
        const bTop = Math.max(0, ballInfo.y - blurRadius);
        const bW = Math.min(blurSize, imgW - bLeft);
        const bH = Math.min(blurSize, imgH - bTop);

        // Extract surrounding region, blur heavily, composite back
        const blurPatch = await sharp(origPath)
          .extract({ left: bLeft, top: bTop, width: bW, height: bH })
          .blur(8)
          .toBuffer();

        await sharp(origPath)
          .composite([{ input: blurPatch, left: bLeft, top: bTop, blend: 'over' }])
          .jpeg({ quality: 92 })
          .toFile(modPath);
        console.log(`    Blur fallback OK`);
      } catch (err2) {
        console.log(`    Blur fallback also failed: ${err2.message}`);
        fs.copyFileSync(origPath, modPath);
        console.log(`    Copied original as last resort`);
      }
    }

    // Collect result
    results.push({
      filename,
      ball_x: ballInfo.xPct,
      ball_y: ballInfo.yPct,
      ball_radius: ballInfo.radius,
      difficulty: fallback.difficulty,
      description: fallback.description,
      confidence: ballInfo.confidence,
      source: ballInfo.source || 'unknown'
    });

    console.log('');
  }

  // ── Step 4: Update database ──
  console.log('=== Updating Database ===');
  try {
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = OFF');
    db.prepare('DELETE FROM game_rounds').run();
    db.prepare('DELETE FROM photos').run();
    db.pragma('foreign_keys = ON');
    console.log('  Cleared existing records.');

    const insert = db.prepare(`
      INSERT INTO photos (filename_original, filename_modified, ball_x, ball_y, ball_radius, difficulty, sport, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAll = db.transaction((photos) => {
      for (const p of photos) {
        insert.run(
          p.filename,
          p.filename,
          p.ball_x,
          p.ball_y,
          p.ball_radius,
          p.difficulty,
          'football',
          p.description
        );
      }
    });

    insertAll(results);
    console.log(`  Inserted ${results.length} photo records.`);

    // Verify
    const rows = db.prepare('SELECT id, filename_original, ball_x, ball_y, ball_radius, difficulty FROM photos ORDER BY id').all();
    console.log('\n  Database contents:');
    for (const row of rows) {
      console.log(`    #${row.id} ${row.filename_original} - ball=(${row.ball_x}%, ${row.ball_y}%) r=${row.ball_radius} [${row.difficulty}]`);
    }
    db.close();
  } catch (err) {
    console.error('  DATABASE ERROR:', err.message);
  }

  // Summary
  console.log(`\n=== Summary ===`);
  console.log(`Processed: ${results.length}/8 photos`);
  for (const r of results) {
    console.log(`  ${r.filename}: ball=(${r.ball_x}%, ${r.ball_y}%) r=${r.ball_radius} conf=${r.confidence} [${r.source}] [${r.difficulty}]`);
  }
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
