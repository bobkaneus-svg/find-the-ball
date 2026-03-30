#!/usr/bin/env node

/**
 * Find the Ball - Pipeline Worker
 * Lighter version for individual pipeline steps.
 *
 * Usage:
 *   node scripts/pipeline-worker.js download 50   - Download 50 more photos
 *   node scripts/pipeline-worker.js detect         - Run detection on unprocessed photos
 *   node scripts/pipeline-worker.js process        - Run erasure on detected photos
 *   node scripts/pipeline-worker.js approve-all    - Approve all processed photos (set active=1)
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

[STAGING_DIR, ORIGINALS_DIR, MODIFIED_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ── Status helpers ──────────────────────────────────────────────────────────

function loadStatus() {
  if (fs.existsSync(STATUS_PATH)) {
    return JSON.parse(fs.readFileSync(STATUS_PATH, 'utf-8'));
  }
  return { lastRun: null, totalDownloaded: 0, totalDetected: 0, totalProcessed: 0, totalApproved: 0, totalFailed: 0, photos: [] };
}

function saveStatus(status) {
  status.lastRun = new Date().toISOString();
  fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2));
}

// ── Curated photo IDs ───────────────────────────────────────────────────────

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
  '1461896836934-bd45ba9ca8d2', '1577223625816-7546f6df9855'
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
  return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
}

// ── COMMAND: download ───────────────────────────────────────────────────────

async function cmdDownload(count) {
  console.log(`\n=== Downloading ${count} photos ===\n`);
  const status = loadStatus();
  const existingHashes = new Set();

  // Hash existing staging files
  const existingFiles = fs.readdirSync(STAGING_DIR).filter(f => f.endsWith('.jpg'));
  for (const f of existingFiles) {
    try { existingHashes.add(fileHash(path.join(STAGING_DIR, f))); } catch {}
  }

  const startIdx = status.photos.length;
  const uniqueIds = [...new Set(FOOTBALL_PHOTO_IDS)];
  let downloaded = 0;
  let attempt = 0;

  // Phase 1: curated
  for (const photoId of uniqueIds) {
    if (downloaded >= count) break;
    attempt++;
    const idx = String(startIdx + downloaded + 1).padStart(3, '0');
    const stagingPath = path.join(STAGING_DIR, `staging_${idx}.jpg`);
    const url = `https://images.unsplash.com/photo-${photoId}?w=800&h=600&fit=crop`;

    process.stdout.write(`  ${downloaded + 1}/${count} (curated)... `);
    try {
      await downloadFile(url, stagingPath);
      const meta = await sharp(stagingPath).metadata();
      if (!meta.width) throw new Error('Invalid');
      const hash = fileHash(stagingPath);
      if (existingHashes.has(hash)) {
        fs.unlinkSync(stagingPath);
        console.log('duplicate, skip');
        continue;
      }
      existingHashes.add(hash);

      status.photos.push({
        id: startIdx + downloaded + 1,
        sourceUrl: url,
        filename: `auto_${idx}.jpg`,
        status: 'downloaded',
        ballX: null, ballY: null, ballRadius: null, confidence: null, error: null
      });
      downloaded++;
      console.log(`OK (${meta.width}x${meta.height})`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      if (fs.existsSync(stagingPath)) fs.unlinkSync(stagingPath);
    }
  }

  // Phase 2: fallback random
  let fallbackAttempt = 0;
  while (downloaded < count && fallbackAttempt < (count - downloaded) * 3) {
    fallbackAttempt++;
    const sig = crypto.randomBytes(8).toString('hex');
    const idx = String(startIdx + downloaded + 1).padStart(3, '0');
    const stagingPath = path.join(STAGING_DIR, `staging_${idx}.jpg`);
    const url = `https://source.unsplash.com/800x600/?soccer,football,ball&sig=${sig}`;

    process.stdout.write(`  ${downloaded + 1}/${count} (fallback)... `);
    try {
      await downloadFile(url, stagingPath);
      const meta = await sharp(stagingPath).metadata();
      if (!meta.width) throw new Error('Invalid');
      const hash = fileHash(stagingPath);
      if (existingHashes.has(hash)) {
        fs.unlinkSync(stagingPath);
        console.log('duplicate, skip');
        continue;
      }
      existingHashes.add(hash);

      status.photos.push({
        id: startIdx + downloaded + 1,
        sourceUrl: url,
        filename: `auto_${idx}.jpg`,
        status: 'downloaded',
        ballX: null, ballY: null, ballRadius: null, confidence: null, error: null
      });
      downloaded++;
      console.log(`OK (${meta.width}x${meta.height})`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      if (fs.existsSync(stagingPath)) fs.unlinkSync(stagingPath);
    }
  }

  status.totalDownloaded = status.photos.length;
  saveStatus(status);
  console.log(`\nDownloaded ${downloaded} new photos. Total: ${status.photos.length}`);
}

// ── COMMAND: detect ─────────────────────────────────────────────────────────

async function cmdDetect() {
  const status = loadStatus();
  const unprocessed = status.photos.filter(p => p.status === 'downloaded');
  console.log(`\n=== Detecting balls in ${unprocessed.length} unprocessed photos ===\n`);

  for (let i = 0; i < unprocessed.length; i++) {
    const photo = unprocessed[i];
    const idx = photo.filename.replace('auto_', '').replace('.jpg', '');
    const stagingPath = path.join(STAGING_DIR, `staging_${idx}.jpg`);

    process.stdout.write(`  ${i + 1}/${unprocessed.length} (${photo.filename})... `);

    if (!fs.existsSync(stagingPath)) {
      photo.status = 'failed';
      photo.error = 'Staging file missing';
      console.log('MISSING');
      continue;
    }

    try {
      const { data, info } = await sharp(stagingPath).raw().toBuffer({ resolveWithObject: true });
      const { width, height, channels } = info;

      function brightness(px, py) {
        if (px < 0 || px >= width || py < 0 || py >= height) return 0;
        const i = (py * width + px) * channels;
        return (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      function isBright(px, py) {
        if (px < 0 || px >= width || py < 0 || py >= height) return false;
        const i = (py * width + px) * channels;
        return data[i] > 190 && data[i + 1] > 190 && data[i + 2] > 190;
      }

      let bestX = -1, bestY = -1, bestRadius = 20, bestScore = 0;
      const STEP = 8, MIN_R = 12, MAX_R = 40;

      for (let cy = MAX_R + 10; cy < height - MAX_R - 10; cy += STEP) {
        for (let cx = MAX_R + 10; cx < width - MAX_R - 10; cx += STEP) {
          for (let r = MIN_R; r <= MAX_R; r += 5) {
            let ib = 0, it = 0, ibs = 0, obs = 0, ob = 0, ot = 0;
            for (let dy = -r; dy <= r; dy += 3) {
              for (let dx = -r; dx <= r; dx += 3) {
                if (dx * dx + dy * dy > r * r) continue;
                const px = cx + dx, py = cy + dy;
                if (px < 0 || px >= width || py < 0 || py >= height) continue;
                it++; ibs += brightness(px, py);
                if (isBright(px, py)) ib++;
              }
            }
            const outerR = Math.round(r * 1.8);
            for (let dy = -outerR; dy <= outerR; dy += 4) {
              for (let dx = -outerR; dx <= outerR; dx += 4) {
                const d2 = dx * dx + dy * dy;
                if (d2 <= r * r || d2 > outerR * outerR) continue;
                const px = cx + dx, py = cy + dy;
                if (px < 0 || px >= width || py < 0 || py >= height) continue;
                ot++; obs += brightness(px, py);
                if (isBright(px, py)) ob++;
              }
            }
            if (it < 5 || ot < 5) continue;
            const id = ib / it, od = ob / ot, dc = id - od;
            const cr = (ibs / it) / ((obs / ot) + 1);
            if (id < 0.4 || dc < 0.15) continue;
            const rp = (r < 12 || r > 40) ? 0.7 : 1.0;
            const yf = cy / height;
            const yb = yf < 0.15 ? 0.3 : (yf > 0.25 ? 1.2 : 0.8);
            const xf = cx / width;
            const ep = (xf < 0.05 || xf > 0.95) ? 0.5 : 1.0;
            const score = dc * id * cr * rp * yb * ep;
            if (score > bestScore) { bestScore = score; bestX = cx; bestY = cy; bestRadius = r; }
          }
        }
      }

      const confidence = Math.min(bestScore, 1.0);
      const found = bestX >= 0 && bestScore > 0.15;

      if (found) {
        photo.ballX = Math.round(bestX / width * 10000) / 100;
        photo.ballY = Math.round(bestY / height * 10000) / 100;
        photo.ballRadius = bestRadius;
        photo.confidence = Math.round(confidence * 1000) / 1000;
        photo.status = confidence >= 0.3 ? 'detected' : 'needs_review';
        console.log(`FOUND (${photo.ballX}%, ${photo.ballY}%) conf=${photo.confidence}`);
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

  status.totalDetected = status.photos.filter(p => ['detected', 'needs_review'].includes(p.status)).length;
  status.totalFailed = status.photos.filter(p => p.status === 'failed').length;
  saveStatus(status);
  console.log(`\nDetection complete. Detected: ${status.totalDetected}, Failed: ${status.totalFailed}`);
}

// ── COMMAND: process ────────────────────────────────────────────────────────

async function cmdProcess() {
  const status = loadStatus();
  const detected = status.photos.filter(p => p.status === 'detected' || p.status === 'needs_review');
  console.log(`\n=== Processing ${detected.length} detected photos ===\n`);

  for (let i = 0; i < detected.length; i++) {
    const photo = detected[i];
    const idx = photo.filename.replace('auto_', '').replace('.jpg', '');
    const stagingPath = path.join(STAGING_DIR, `staging_${idx}.jpg`);
    const origPath = path.join(ORIGINALS_DIR, photo.filename);
    const modPath = path.join(MODIFIED_DIR, photo.filename);

    process.stdout.write(`  ${i + 1}/${detected.length} (${photo.filename})... `);

    if (!fs.existsSync(stagingPath)) {
      photo.status = 'failed';
      photo.error = 'Staging file missing';
      console.log('MISSING');
      continue;
    }

    try {
      fs.copyFileSync(stagingPath, origPath);
      const meta = await sharp(origPath).metadata();
      const w = meta.width, h = meta.height;
      const ballX = Math.round(photo.ballX * w / 100);
      const ballY = Math.round(photo.ballY * h / 100);

      const radius = Math.max(photo.ballRadius, 12);
      const patchRadius = Math.round(radius * 2.5);
      const patchSize = patchRadius * 2;
      const safePatchSize = Math.min(patchSize, w - 2, h - 2);

      const { data: rawData, info: rawInfo } = await sharp(origPath).raw().toBuffer({ resolveWithObject: true });
      const ch = rawInfo.channels;

      function avgColor(cx, cy, r) {
        let rs = 0, gs = 0, bs = 0, cnt = 0;
        for (let dy = -r; dy <= r; dy += 3) {
          for (let dx = -r; dx <= r; dx += 3) {
            if (dx * dx + dy * dy > r * r) continue;
            const px = cx + dx, py = cy + dy;
            if (px < 0 || px >= w || py < 0 || py >= h) continue;
            const ii = (py * w + px) * ch;
            rs += rawData[ii]; gs += rawData[ii + 1]; bs += rawData[ii + 2]; cnt++;
          }
        }
        return cnt ? { r: rs / cnt, g: gs / cnt, b: bs / cnt } : { r: 128, g: 128, b: 128 };
      }

      const surround = avgColor(ballX, ballY, Math.round(radius * 1.8));
      const offsets = [
        { dx: 0, dy: -patchRadius * 1.5 }, { dx: 0, dy: patchRadius * 1.5 },
        { dx: -patchRadius * 1.5, dy: 0 }, { dx: patchRadius * 1.5, dy: 0 },
        { dx: -patchRadius * 1.1, dy: -patchRadius * 1.1 }, { dx: patchRadius * 1.1, dy: -patchRadius * 1.1 },
        { dx: -patchRadius * 1.1, dy: patchRadius * 1.1 }, { dx: patchRadius * 1.1, dy: patchRadius * 1.1 },
      ];

      let bestOff = offsets[0], bestDiff = Infinity;
      for (const off of offsets) {
        const sx = Math.round(ballX + off.dx), sy = Math.round(ballY + off.dy);
        if (sx - safePatchSize / 2 < 0 || sx + safePatchSize / 2 >= w ||
            sy - safePatchSize / 2 < 0 || sy + safePatchSize / 2 >= h) continue;
        const sc = avgColor(sx, sy, Math.round(radius * 1.2));
        const diff = Math.abs(sc.r - surround.r) + Math.abs(sc.g - surround.g) + Math.abs(sc.b - surround.b);
        if (diff < bestDiff) { bestDiff = diff; bestOff = off; }
      }

      const srcCx = Math.round(Math.max(safePatchSize / 2, Math.min(w - safePatchSize / 2 - 1, ballX + bestOff.dx)));
      const srcCy = Math.round(Math.max(safePatchSize / 2, Math.min(h - safePatchSize / 2 - 1, ballY + bestOff.dy)));
      const eL = Math.max(0, Math.round(srcCx - safePatchSize / 2));
      const eT = Math.max(0, Math.round(srcCy - safePatchSize / 2));
      const eW = Math.min(safePatchSize, w - eL);
      const eH = Math.min(safePatchSize, h - eT);

      const patchBuf = await sharp(origPath)
        .extract({ left: eL, top: eT, width: eW, height: eH })
        .resize(safePatchSize, safePatchSize).blur(3.5).png().toBuffer();

      const mc = Math.round(safePatchSize / 2);
      const mr = Math.round(safePatchSize / 2);
      const maskSvg = Buffer.from(`<svg width="${safePatchSize}" height="${safePatchSize}" xmlns="http://www.w3.org/2000/svg">
        <defs><radialGradient id="g" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="white" stop-opacity="1"/>
          <stop offset="65%" stop-color="white" stop-opacity="1"/>
          <stop offset="100%" stop-color="black" stop-opacity="1"/>
        </radialGradient></defs>
        <rect width="${safePatchSize}" height="${safePatchSize}" fill="black"/>
        <circle cx="${mc}" cy="${mc}" r="${mr}" fill="url(#g)"/>
      </svg>`);

      const maskedPatch = await sharp(patchBuf).ensureAlpha()
        .composite([{ input: await sharp(maskSvg).resize(safePatchSize, safePatchSize).grayscale().toBuffer(), blend: 'dest-in' }])
        .png().toBuffer();

      const cL = Math.max(0, Math.round(ballX - safePatchSize / 2));
      const cT = Math.max(0, Math.round(ballY - safePatchSize / 2));

      await sharp(origPath)
        .composite([{ input: maskedPatch, left: cL, top: cT, blend: 'over' }])
        .jpeg({ quality: 92 }).toFile(modPath);

      photo.status = 'processed';
      console.log('OK');
    } catch (err) {
      // Blur fallback
      try {
        fs.copyFileSync(stagingPath, origPath);
        const meta = await sharp(origPath).metadata();
        const bx = Math.round(photo.ballX * meta.width / 100);
        const by = Math.round(photo.ballY * meta.height / 100);
        const br = Math.max(photo.ballRadius * 2, 30);
        const bL = Math.max(0, bx - br), bT = Math.max(0, by - br);
        const bW = Math.min(br * 2, meta.width - bL), bH = Math.min(br * 2, meta.height - bT);
        const blurP = await sharp(origPath).extract({ left: bL, top: bT, width: bW, height: bH }).blur(8).toBuffer();
        await sharp(origPath).composite([{ input: blurP, left: bL, top: bT, blend: 'over' }]).jpeg({ quality: 92 }).toFile(modPath);
        photo.status = 'processed';
        console.log('OK (blur fallback)');
      } catch (err2) {
        photo.status = 'failed';
        photo.error = err.message;
        console.log(`FAILED: ${err.message}`);
      }
    }
  }

  status.totalProcessed = status.photos.filter(p => p.status === 'processed').length;
  status.totalFailed = status.photos.filter(p => p.status === 'failed').length;
  saveStatus(status);

  // Insert processed into DB
  const processed = status.photos.filter(p => p.status === 'processed');
  if (processed.length > 0) {
    try {
      const db = new Database(DB_PATH);
      db.pragma('journal_mode = WAL');
      const insert = db.prepare(`
        INSERT INTO photos (filename_original, filename_modified, ball_x, ball_y, ball_radius, difficulty, sport, description, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertAll = db.transaction((items) => {
        for (const p of items) {
          const diff = p.confidence > 0.7 ? 'easy' : (p.confidence > 0.4 ? 'medium' : 'hard');
          insert.run(p.filename, p.filename, p.ballX, p.ballY, p.ballRadius, diff, 'football',
            `Pipeline: ${p.sourceUrl ? p.sourceUrl.substring(0, 60) : 'unknown'}`, 0);
        }
      });
      insertAll(processed);
      db.close();
      console.log(`\nInserted ${processed.length} photos into DB (active=0).`);
    } catch (err) {
      console.error(`DB error: ${err.message}`);
    }
  }

  console.log(`\nProcessing complete. Processed: ${status.totalProcessed}, Failed: ${status.totalFailed}`);
}

// ── COMMAND: approve-all ────────────────────────────────────────────────────

function cmdApproveAll() {
  console.log('\n=== Approving all processed photos ===\n');

  try {
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    const result = db.prepare('UPDATE photos SET active = 1 WHERE active = 0').run();
    console.log(`  Approved ${result.changes} photos (set active=1).`);

    const total = db.prepare('SELECT COUNT(*) as cnt FROM photos WHERE active = 1').get();
    console.log(`  Total active photos: ${total.cnt}`);
    db.close();

    // Update status
    const status = loadStatus();
    status.totalApproved = result.changes;
    for (const p of status.photos) {
      if (p.status === 'processed') p.status = 'approved';
    }
    saveStatus(status);
  } catch (err) {
    console.error(`Error: ${err.message}`);
  }
}

// ── Main dispatch ───────────────────────────────────────────────────────────

async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  switch (command) {
    case 'download':
      await cmdDownload(parseInt(arg, 10) || 50);
      break;
    case 'detect':
      await cmdDetect();
      break;
    case 'process':
      await cmdProcess();
      break;
    case 'approve-all':
      cmdApproveAll();
      break;
    default:
      console.log('Usage:');
      console.log('  node scripts/pipeline-worker.js download [count]  - Download photos');
      console.log('  node scripts/pipeline-worker.js detect            - Detect balls in downloaded photos');
      console.log('  node scripts/pipeline-worker.js process           - Erase balls and save');
      console.log('  node scripts/pipeline-worker.js approve-all       - Activate all processed photos');
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
