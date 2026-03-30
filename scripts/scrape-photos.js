const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const RAW_DIR = path.join(__dirname, '..', 'public', 'photos', 'raw');

// Ensure output directory exists
fs.mkdirSync(RAW_DIR, { recursive: true });

// --- URL Sources ---

// 1. Curated Unsplash direct URLs (no redirects)
const curatedUrls = [
  'https://images.unsplash.com/photo-1553778263-73a83bab9b0c?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1511886929837-354d827aae26?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1486286701208-1d58e9338013?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1459865264687-595cf39c0e36?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1508098682722-e99c43a406f2?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1587329310686-91414b8e3cb7?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1543326727-cf54bb3eb540?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1575361204480-aadea25e6e68?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1518091043644-c1482e47f3c2?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1518604666860-9ed391f76460?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1556056702-d0db65abd47a?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1517927033932-b3d18e61fb3f?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1542185400-f1c993ecbea4?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1516567727245-60537ce63dd5?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1614632537423-1e6e60e3f7d0?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1600679472829-3044539ce8ed?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1577223625816-7546f13df25d?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1561154464-82e9aab73227?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1552667466-07770ae110d0?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1434648957308-5e6a859697e8?w=800&h=600&fit=crop',
  // Additional football/soccer Unsplash photos
  'https://images.unsplash.com/photo-1624880357913-a8539238245b?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1521731978332-9e9e714bdd20?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1508766917616-d22f3f1eea14?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1570498839593-e565b39455fc?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1626248801379-51a0748a5f96?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1602472097151-5d7d887dec8e?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1623607915241-4ab5e9a9e94a?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1599204606808-b99e0a881779?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1628891890467-b79f2c8ba9dc?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1585776245991-cf89dd7fc73a?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1560012057-4372e14c5085?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1563299796-17596ed6b017?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1567169108890-a6a72403b2c0?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1594737626072-90dc274bc2bd?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1508766206392-8bd5cf550d1c?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1516306580123-e6e52b1b7b5f?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1610201417828-b0fa3e148882?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1598885159329-9377168ac375?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1560264280-88b68371db39?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1543351611-58f69d7c1cc2?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1508098682722-e99c43a406f2?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1596727147705-61a532a659bd?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1461896836934-bd45ba8fcfdb?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1459865264687-595cf39c0e36?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1556056702-d0db65abd47a?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1615729947596-a598e5de0ab3?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1517927033932-b3d18e61fb3f?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1574680178050-55c6a6a96e0a?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1473976345543-9ffc928e648d?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1522778526097-ce0a22ceb253?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1610901157620-340856d0a50f?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1579687169638-a89d8dcbbbe8?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1600679472829-3044539ce8ed?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1521412644187-c49fa049e84d?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1580748142464-a6e01677d51e?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1569863959165-56dae551d4fc?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1577223625816-7546f13df25d?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1504305754058-2f08ccd89a0a?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1587384474964-3a06ce1ce699?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1518604666860-9ed391f76460?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1471295253337-3ceaaedca402?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1575361204480-aadea25e6e68?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1516567727245-60537ce63dd5?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1518091043644-c1482e47f3c2?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1561154464-82e9aab73227?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1552667466-07770ae110d0?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1614632537423-1e6e60e3f7d0?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1486286701208-1d58e9338013?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1587329310686-91414b8e3cb7?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1543326727-cf54bb3eb540?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1511886929837-354d827aae26?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1553778263-73a83bab9b0c?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1542185400-f1c993ecbea4?w=800&h=600&fit=crop',
];

// 2. No source.unsplash.com (deprecated). Skip to Pexels.
const sourceUrls = [];

// 3. Pexels fallback photo IDs (football/soccer related - expanded)
const pexelsIds = [
  46798, 47730, 47354, 114296, 209841, 274422, 399187, 1171084,
  1279107, 1884574, 2209, 2570139, 2570140, 2570141, 2570142,
  3621104, 3628912, 3651673, 3659714, 3660194, 3660204, 3660209,
  3886078, 3886079, 3886082, 3886083, 3886084, 3886087, 3886091,
  3886094, 3886095, 3886096, 3886100, 3886103, 3886104, 3886105,
  3886106, 3886107, 3886108, 3886110, 3886111, 3886112, 3886113,
  3886114, 3886115, 3886116, 3886117, 3886118, 3886119, 3886120,
  4056738, 4861367, 5246967, 5889932, 5952652, 6591429, 6620865,
  7667756, 8060359, 8886398, 9306069, 10845710, 15038824, 16483858,
  // Additional Pexels football/soccer IDs
  1618200, 1667583, 1667071, 2834917, 2277978, 3041110, 3148452,
  7210255, 7210261, 7210264, 7210267, 7210270, 7210273, 7210276,
  3044085, 3044086, 3044087, 4792498, 4792497, 4792496,
  1171083, 1171085, 1171086, 1171087, 1171088, 1171089,
  8941662, 8941663, 8941664, 8941665, 8941666,
  2291006, 2291007, 2291008, 2291009, 2291010,
  3764011, 3764012, 3764013, 3764014, 3764015,
  5752303, 5752304, 5752305, 5752306, 5752307,
  6077791, 6077792, 6077793, 6077794, 6077795,
];
const pexelsUrls = pexelsIds.map(
  (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?w=800&h=600&fit=crop`
);

// Combine all URLs: curated first, then source.unsplash, then pexels
const allUrls = [...curatedUrls, ...sourceUrls, ...pexelsUrls];

// --- Download helpers ---

const MIN_FILE_SIZE = 10 * 1024; // 10 KB
const CONCURRENCY = 5;
const TIMEOUT_MS = 15000;

async function downloadWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const seenHashes = new Set();
  let fileIndex = 0;
  let downloaded = 0;
  let uniqueCount = 0;
  let skippedDup = 0;
  let skippedSmall = 0;
  let errors = 0;
  const total = allUrls.length;

  console.log(`Starting download of up to ${total} photos...`);
  console.log(`Output directory: ${RAW_DIR}\n`);

  // Process in batches for concurrency control
  for (let i = 0; i < total; i += CONCURRENCY) {
    const batch = allUrls.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (url, batchIdx) => {
        const globalIdx = i + batchIdx;
        try {
          const buf = await downloadWithTimeout(url, TIMEOUT_MS);

          if (buf.length < MIN_FILE_SIZE) {
            skippedSmall++;
            return { status: 'small' };
          }

          // MD5 dedup
          const hash = crypto.createHash('md5').update(buf).digest('hex');
          if (seenHashes.has(hash)) {
            skippedDup++;
            return { status: 'dup' };
          }
          seenHashes.add(hash);

          // Resize to exactly 800x600 using sharp
          fileIndex++;
          const filename = `raw_${String(fileIndex).padStart(3, '0')}.jpg`;
          const outPath = path.join(RAW_DIR, filename);

          const resized = await sharp(buf)
            .resize(800, 600, { fit: 'cover' })
            .jpeg({ quality: 85 })
            .toBuffer();

          fs.writeFileSync(outPath, resized);
          uniqueCount++;
          return { status: 'ok', filename };
        } catch (err) {
          errors++;
          return { status: 'error', msg: err.message };
        }
      })
    );

    downloaded += batch.length;
    process.stdout.write(
      `\rDownloaded ${downloaded}/${total}... (${uniqueCount} unique so far, ${skippedDup} dups, ${skippedSmall} too small, ${errors} errors)`
    );

    // Early exit if we have enough
    if (uniqueCount >= 120) {
      console.log('\n\nReached 120 unique photos, stopping early.');
      break;
    }

    // Small delay to be polite to servers
    if (i + CONCURRENCY < total) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log('\n');
  console.log('=== SUMMARY ===');
  console.log(`Total URLs attempted: ${downloaded}`);
  console.log(`Unique photos saved:  ${uniqueCount}`);
  console.log(`Duplicates skipped:   ${skippedDup}`);
  console.log(`Too small (<10KB):    ${skippedSmall}`);
  console.log(`Errors:               ${errors}`);
  console.log(`Output directory:     ${RAW_DIR}`);

  if (uniqueCount < 100) {
    console.log(`\n⚠ Only got ${uniqueCount} unique photos. You may need additional sources.`);
  } else {
    console.log(`\n✓ Got ${uniqueCount} unique photos (target was 100+).`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
