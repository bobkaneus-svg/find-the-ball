#!/usr/bin/env node

/**
 * Find the Ball - Automated Photo Pipeline
 * Downloads football photos, detects balls, erases them, inserts into DB.
 *
 * Usage: node scripts/pipeline.js [--limit N] [--test]
 *   --limit N   Process only N photos (default: 100)
 *   --test      Run in test mode (5 photos only)
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const Database = require('better-sqlite3');

// ── Paths ────────────────────────────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(PROJECT_ROOT, 'data', 'staging');
const ORIGINALS_DIR = path.join(PROJECT_ROOT, 'public', 'photos', 'originals');
const MODIFIED_DIR = path.join(PROJECT_ROOT, 'public', 'photos', 'modified');
const DB_PATH = path.join(PROJECT_ROOT, 'data', 'findtheball.db');
const STATUS_PATH = path.join(PROJECT_ROOT, 'data', 'pipeline-status.json');

// Ensure directories exist
[STAGING_DIR, ORIGINALS_DIR, MODIFIED_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isTest = args.includes('--test');
const limitIdx = args.indexOf('--limit');
const TARGET_COUNT = isTest ? 5 : (limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 100);

// ── Curated Unsplash football photo IDs ─────────────────────────────────────
const FOOTBALL_PHOTO_IDS = [
  '1553778263-73a83bab9b0c', '1431324155629-1a6deb1dec8d',
  '1574629810360-7efbbe195018', '1560272564-c83b66b1ad12',
  '1579952363873-27f3bade9f55', '1517466787929-bc90951d0974',
  '1511886929837-354d827aae26', '1551958219-acbc608c6377',
  '1486286701208-1d58e9338013', '1459865264687-595cf39c0e36',
  '1508098682722-e99c43a406f2', '1522778119026-d647f0596c20',
  '1493711662062-fa541adb3fc8', '1587329310686-91414b8e3cb7',
  '1543326727-cf54bb3eb540', '1470229722913-7c0e2dbbafd3',
  '1575361204480-aadea25e6e68', '1518091043644-c1482e47f3c2',
  '1518604666860-9ed391f76460', '1529900748604-07564a03e7a6',
  '1556056702-d0db65abd47a', '1517927033932-b3d18e61fb3f',
  '1489944440615-453fc2b6a9a9', '1542185400-f1c993ecbea4',
  '1606925797300-0b35e9d1794e', '1516567727245-60537ce63dd5',
  '1624880357913-a8539238245b', '1599058917212-d750089bc07e',
  '1461896836934-bd45ba9ca8d2', '1577223625816-7546f6df9855',
  '1560272564-c83b66b1ad12', '1579952363873-27f3bade9f55',
  '1431324155629-1a6deb1dec8d', '1551958219-acbc608c6377',
  '1543326727-cf54bb3eb540', '1470229722913-7c0e2dbbafd3',
  '1575361204480-aadea25e6e68', '1518091043644-c1482e47f3c2',
  '1508098682722-e99c43a406f2', '1522778119026-d647f0596c20',
  '1493711662062-fa541adb3fc8', '1587329310686-91414b8e3cb7',
  '1486286701208-1d58e9338013', '1459865264687-595cf39c0e36',
  '1553778263-73a83bab9b0c', '1517466787929-bc90951d0974',
  '1511886929837-354d827aae26', '1529900748604-07564a03e7a6',
  '1556056702-d0db65abd47a', '1517927033932-b3d18e61fb3f',
  '1518604666860-9ed391f76460', '1489944440615-453fc2b6a9a9'
];

// ── Download helper ─────────────────────────────────────────────────────────

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

function fileHash(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(buf).digest('hex');
}

// ── Step A: Download photos ─────────────────────────────────────────────────

async function downloadPhotos(target) {
  console.log(`\n=== STEP A: Downloading ${target} photos ===\n`);

  const seenHashes = new Set();
  const downloaded = [];
  let attempt = 0;

  // Deduplicate the curated IDs
  const uniqueIds = [...new Set(FOOTBALL_PHOTO_IDS)];

  // Phase 1: download from curated IDs
  for (const photoId of uniqueIds) {
    if (downloaded.length >= target) break;
    attempt++;
    const idx = String(downloaded.length + 1).padStart(3, '0');
    const stagingPath = path.join(STAGING_DIR, `staging_${idx}.jpg`);
    const url = `https://images.unsplash.com/photo-${photoId}?w=800&h=600&fit=crop`;

    process.stdout.write(`  Downloading ${downloaded.length + 1}/${target} (curated #${attempt})... `);

    try {
      await downloadFile(url, stagingPath);
      // Check it's a valid image
      const meta = await sharp(stagingPath).metadata();
      if (!meta.width || !meta.height) throw new Error('Invalid image');

      // Check duplicate by hash
      const hash = fileHash(stagingPath);
      if (seenHashes.has(hash)) {
        fs.unlinkSync(stagingPath);
        console.log('SKIP (duplicate)');
        continue;
      }
      seenHashes.add(hash);

      downloaded.push({
        filename: `auto_${idx}.jpg`,
        stagingPath,
        sourceUrl: url,
        width: meta.width,
        height: meta.height
      });
      console.log(`OK (${meta.width}x${meta.height})`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      if (fs.existsSync(stagingPath)) fs.unlinkSync(stagingPath);
    }
  }

  // Phase 2: fallback random search if we need more
  let fallbackAttempt = 0;
  const maxFallbackAttempts = (target - downloaded.length) * 3; // 3x attempts
  while (downloaded.length < target && fallbackAttempt < maxFallbackAttempts) {
    fallbackAttempt++;
    const sig = crypto.randomBytes(8).toString('hex');
    const idx = String(downloaded.length + 1).padStart(3, '0');
    const stagingPath = path.join(STAGING_DIR, `staging_${idx}.jpg`);
    const url = `https://source.unsplash.com/800x600/?soccer,football,ball&sig=${sig}`;

    process.stdout.write(`  Downloading ${downloaded.length + 1}/${target} (fallback #${fallbackAttempt})... `);

    try {
      await downloadFile(url, stagingPath);
      const meta = await sharp(stagingPath).metadata();
      if (!meta.width || !meta.height) throw new Error('Invalid image');

      const hash = fileHash(stagingPath);
      if (seenHashes.has(hash)) {
        fs.unlinkSync(stagingPath);
        console.log('SKIP (duplicate)');
        continue;
      }
      seenHashes.add(hash);

      downloaded.push({
        filename: `auto_${idx}.jpg`,
        stagingPath,
        sourceUrl: url,
        width: meta.width,
        height: meta.height
      });
      console.log(`OK (${meta.width}x${meta.height})`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      if (fs.existsSync(stagingPath)) fs.unlinkSync(stagingPath);
    }
  }

  console.log(`\n  Downloaded: ${downloaded.length}/${target}`);
  return downloaded;
}

// ── Step B: Ball detection ──────────────────────────────────────────────────

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
  const MIN_RADIUS = 12;
  const MAX_RADIUS = 40;

  let bestX = -1, bestY = -1, bestRadius = 20, bestScore = 0;
  const candidates = [];

  // Grid scan
  for (let cy = MAX_RADIUS + 10; cy < height - MAX_RADIUS - 10; cy += STEP) {
    for (let cx = MAX_RADIUS + 10; cx < width - MAX_RADIUS - 10; cx += STEP) {
      for (let r = MIN_RADIUS; r <= MAX_RADIUS; r += 5) {
        let innerBright = 0, innerTotal = 0;
        let innerBrightnessSum = 0;
        let outerBrightnessSum = 0;
        let outerBright = 0, outerTotal = 0;

        // Sample inside circle
        for (let dy = -r; dy <= r; dy += 3) {
          for (let dx = -r; dx <= r; dx += 3) {
            const dist2 = dx * dx + dy * dy;
            const px = cx + dx, py = cy + dy;
            if (px < 0 || px >= width || py < 0 || py >= height) continue;
            if (dist2 <= r * r) {
              innerTotal++;
              innerBrightnessSum += brightness(px, py);
              if (isBright(px, py)) innerBright++;
            }
          }
        }

        // Sample outer ring (1.0r to 1.8r)
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
        const contrastRatio = innerAvgBrightness / (outerAvgBrightness + 1);
        const densityContrast = innerDensity - outerDensity;

        if (innerDensity < 0.4) continue;
        if (densityContrast < 0.15) continue;

        const radiusPenalty = (r < 12 || r > 40) ? 0.7 : 1.0;
        // Penalize top 15% of image (sky)
        const yFraction = cy / height;
        const yBonus = yFraction < 0.15 ? 0.3 : (yFraction > 0.25 ? 1.2 : 0.8);
        // Penalize edges
        const xFraction = cx / width;
        const edgePenalty = (xFraction < 0.05 || xFraction > 0.95) ? 0.5 : 1.0;
        const score = densityContrast * innerDensity * contrastRatio * radiusPenalty * yBonus * edgePenalty;

        if (score > bestScore) {
          bestScore = score;
          bestX = cx;
          bestY = cy;
          bestRadius = r;
        }
        if (score > 0.3) {
          candidates.push({ x: cx, y: cy, r, score });
        }
      }
    }
  }

  // Refine around best candidate
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
          const yFraction = cy / height;
          const yBonus = yFraction < 0.15 ? 0.3 : (yFraction > 0.25 ? 1.2 : 0.8);
          const xFraction = cx / width;
          const edgePenalty = (xFraction < 0.05 || xFraction > 0.95) ? 0.5 : 1.0;
          const score = densityContrast * innerDensity * contrastRatio * radiusPenalty * yBonus * edgePenalty;

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
    found: bestX >= 0 && bestScore > 0.15,
    x: bestX, y: bestY, radius: bestRadius,
    xPct: Math.round(xPct * 100) / 100,
    yPct: Math.round(yPct * 100) / 100,
    confidence: Math.round(confidence * 1000) / 1000,
    width, height,
    candidateCount: candidates.length
  };
}

async function detectBalls(photos) {
  console.log(`\n=== STEP B: Detecting balls in ${photos.length} photos ===\n`);

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    process.stdout.write(`  Detecting ball in photo ${i + 1}/${photos.length} (${photo.filename})... `);

    try {
      const result = await detectBall(photo.stagingPath);
      photo.detection = result;

      if (result.found && result.confidence >= 0.3) {
        photo.status = 'auto_approved';
        console.log(`DETECTED (${result.xPct}%, ${result.yPct}%) r=${result.radius} conf=${result.confidence}`);
      } else if (result.found) {
        photo.status = 'needs_review';
        console.log(`LOW CONF (${result.xPct}%, ${result.yPct}%) conf=${result.confidence}`);
      } else {
        photo.status = 'failed';
        photo.error = 'No ball detected';
        console.log('NOT FOUND');
      }
    } catch (err) {
      photo.status = 'failed';
      photo.error = err.message;
      console.log(`ERROR: ${err.message}`);
    }
  }

  const detected = photos.filter(p => p.status !== 'failed').length;
  const approved = photos.filter(p => p.status === 'auto_approved').length;
  const review = photos.filter(p => p.status === 'needs_review').length;
  const failed = photos.filter(p => p.status === 'failed').length;
  console.log(`\n  Detected: ${detected}/${photos.length} (auto_approved: ${approved}, needs_review: ${review}, failed: ${failed})`);
  return photos;
}

// ── Step C: Ball erasure ────────────────────────────────────────────────────

async function eraseBall(inputPath, outputPath, ballCx, ballCy, ballRadius, imgWidth, imgHeight) {
  const radius = Math.max(ballRadius, 12);
  const patchRadius = Math.round(radius * 2.5);
  const patchSize = patchRadius * 2;
  const safePatchSize = Math.min(patchSize, imgWidth - 2, imgHeight - 2);

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

  const surroundColor = avgColor(ballCx, ballCy, Math.round(radius * 1.8));

  // Sample 8 directions to find best background patch
  const offsets = [
    { dx: 0, dy: -patchRadius * 1.5 },                    // up
    { dx: 0, dy: patchRadius * 1.5 },                     // down
    { dx: -patchRadius * 1.5, dy: 0 },                    // left
    { dx: patchRadius * 1.5, dy: 0 },                     // right
    { dx: -patchRadius * 1.1, dy: -patchRadius * 1.1 },   // top-left
    { dx: patchRadius * 1.1, dy: -patchRadius * 1.1 },    // top-right
    { dx: -patchRadius * 1.1, dy: patchRadius * 1.1 },    // bottom-left
    { dx: patchRadius * 1.1, dy: patchRadius * 1.1 },     // bottom-right
  ];

  let bestOffset = offsets[0];
  let bestDiff = Infinity;

  for (const off of offsets) {
    const sx = Math.round(ballCx + off.dx);
    const sy = Math.round(ballCy + off.dy);
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

  const srcCx = Math.round(Math.max(safePatchSize / 2, Math.min(imgWidth - safePatchSize / 2 - 1,
    ballCx + bestOffset.dx)));
  const srcCy = Math.round(Math.max(safePatchSize / 2, Math.min(imgHeight - safePatchSize / 2 - 1,
    ballCy + bestOffset.dy)));

  const extractLeft = Math.max(0, Math.round(srcCx - safePatchSize / 2));
  const extractTop = Math.max(0, Math.round(srcCy - safePatchSize / 2));
  const extractW = Math.min(safePatchSize, imgWidth - extractLeft);
  const extractH = Math.min(safePatchSize, imgHeight - extractTop);

  // Extract source patch and blur (sigma 3-4)
  const patchBuf = await sharp(inputPath)
    .extract({ left: extractLeft, top: extractTop, width: extractW, height: extractH })
    .resize(safePatchSize, safePatchSize)
    .blur(3.5)
    .png()
    .toBuffer();

  // Feathered circular mask using SVG radialGradient
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

  const maskedPatch = await sharp(patchBuf)
    .ensureAlpha()
    .composite([{
      input: await sharp(maskSvg).resize(safePatchSize, safePatchSize).grayscale().toBuffer(),
      blend: 'dest-in',
    }])
    .png()
    .toBuffer();

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

  return { compLeft, compTop, patchSize: safePatchSize };
}

async function eraseAllBalls(photos) {
  const processable = photos.filter(p => p.status === 'auto_approved' || p.status === 'needs_review');
  console.log(`\n=== STEP C: Erasing balls from ${processable.length} photos ===\n`);

  for (let i = 0; i < processable.length; i++) {
    const photo = processable[i];
    const det = photo.detection;
    const origPath = path.join(ORIGINALS_DIR, photo.filename);
    const modPath = path.join(MODIFIED_DIR, photo.filename);

    process.stdout.write(`  Erasing ball in photo ${i + 1}/${processable.length} (${photo.filename})... `);

    try {
      // Copy staging to originals
      fs.copyFileSync(photo.stagingPath, origPath);

      await eraseBall(origPath, modPath, det.x, det.y, det.radius, det.width, det.height);
      photo.status = photo.status === 'auto_approved' ? 'processed' : 'needs_review';
      console.log('OK');
    } catch (err) {
      // Blur fallback
      try {
        process.stdout.write('(blur fallback) ');
        fs.copyFileSync(photo.stagingPath, origPath);
        const blurRadius = Math.max(det.radius * 2, 30);
        const bLeft = Math.max(0, det.x - blurRadius);
        const bTop = Math.max(0, det.y - blurRadius);
        const bW = Math.min(blurRadius * 2, det.width - bLeft);
        const bH = Math.min(blurRadius * 2, det.height - bTop);

        const blurPatch = await sharp(origPath)
          .extract({ left: bLeft, top: bTop, width: bW, height: bH })
          .blur(8)
          .toBuffer();

        await sharp(origPath)
          .composite([{ input: blurPatch, left: bLeft, top: bTop, blend: 'over' }])
          .jpeg({ quality: 92 })
          .toFile(modPath);
        photo.status = 'processed';
        console.log('OK (blur)');
      } catch (err2) {
        photo.status = 'failed';
        photo.error = `Erasure failed: ${err.message}; blur failed: ${err2.message}`;
        console.log(`FAILED: ${err.message}`);
      }
    }
  }

  const processed = photos.filter(p => p.status === 'processed').length;
  console.log(`\n  Processed: ${processed}/${processable.length}`);
  return photos;
}

// ── Step D: Database insertion ───────────────────────────────────────────────

function insertIntoDatabase(photos) {
  const processable = photos.filter(p => p.status === 'processed' || p.status === 'needs_review');
  console.log(`\n=== STEP D: Inserting ${processable.length} photos into database ===\n`);

  try {
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Ensure photos table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename_original TEXT NOT NULL,
        filename_modified TEXT NOT NULL,
        ball_x REAL NOT NULL,
        ball_y REAL NOT NULL,
        ball_radius REAL DEFAULT 30,
        difficulty TEXT DEFAULT 'medium',
        sport TEXT DEFAULT 'football',
        description TEXT,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const insert = db.prepare(`
      INSERT INTO photos (filename_original, filename_modified, ball_x, ball_y, ball_radius, difficulty, sport, description, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAll = db.transaction((items) => {
      for (const p of items) {
        const det = p.detection;
        const difficulty = det.confidence > 0.7 ? 'easy' : (det.confidence > 0.4 ? 'medium' : 'hard');
        insert.run(
          p.filename,
          p.filename,
          det.xPct,
          det.yPct,
          det.radius,
          difficulty,
          'football',
          `Auto-processed from ${p.sourceUrl.substring(0, 60)}...`,
          0  // active = 0, admin must approve
        );
      }
    });

    insertAll(processable);
    console.log(`  Inserted ${processable.length} records (active=0, pending admin approval).`);

    // Verify
    const count = db.prepare('SELECT COUNT(*) as cnt FROM photos WHERE active = 0').get();
    console.log(`  Total inactive (pipeline) photos in DB: ${count.cnt}`);
    db.close();

    return processable.length;
  } catch (err) {
    console.error(`  DATABASE ERROR: ${err.message}`);
    return 0;
  }
}

// ── Status tracking ─────────────────────────────────────────────────────────

function saveStatus(photos) {
  const status = {
    lastRun: new Date().toISOString(),
    totalDownloaded: photos.length,
    totalDetected: photos.filter(p => p.detection && p.detection.found).length,
    totalProcessed: photos.filter(p => p.status === 'processed').length,
    totalApproved: 0,
    totalFailed: photos.filter(p => p.status === 'failed').length,
    photos: photos.map((p, i) => ({
      id: i + 1,
      sourceUrl: p.sourceUrl,
      filename: p.filename,
      status: p.status || 'unknown',
      ballX: p.detection ? p.detection.xPct : null,
      ballY: p.detection ? p.detection.yPct : null,
      ballRadius: p.detection ? p.detection.radius : null,
      confidence: p.detection ? p.detection.confidence : null,
      error: p.error || null
    }))
  };

  fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2));
  console.log(`\n  Status saved to ${STATUS_PATH}`);
  return status;
}

// ── Main pipeline ───────────────────────────────────────────────────────────

async function main() {
  console.log('========================================');
  console.log('  Find the Ball - Automated Pipeline');
  console.log(`  Target: ${TARGET_COUNT} photos`);
  console.log(`  Mode: ${isTest ? 'TEST' : 'FULL'}`);
  console.log('========================================');

  const startTime = Date.now();

  // Step A: Download
  let photos = await downloadPhotos(TARGET_COUNT);

  if (photos.length === 0) {
    console.log('\nNo photos downloaded. Exiting.');
    process.exit(1);
  }

  // Step B: Detect
  photos = await detectBalls(photos);

  // Step C: Erase
  photos = await eraseAllBalls(photos);

  // Step D: Database
  const inserted = insertIntoDatabase(photos);

  // Save status
  const status = saveStatus(photos);

  // Clean up staging files
  console.log('\n  Cleaning up staging files...');
  for (const photo of photos) {
    if (fs.existsSync(photo.stagingPath)) {
      fs.unlinkSync(photo.stagingPath);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n========================================');
  console.log('  Pipeline Complete!');
  console.log(`  Time: ${elapsed}s`);
  console.log(`  Downloaded: ${status.totalDownloaded}`);
  console.log(`  Detected: ${status.totalDetected}`);
  console.log(`  Processed: ${status.totalProcessed}`);
  console.log(`  Failed: ${status.totalFailed}`);
  console.log(`  Inserted to DB: ${inserted} (inactive, pending approval)`);
  console.log('========================================');
}

main().catch(err => {
  console.error('Fatal pipeline error:', err);
  process.exit(1);
});
