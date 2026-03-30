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

// Photo definitions with Unsplash IDs and ball positions (percentages 0-100)
const PHOTOS = [
  {
    id: 'photo-1574629810360-7efbbe195018',
    filename: 'photo_01.jpg',
    ball_x: 55, ball_y: 72,
    ball_radius: 25,
    difficulty: 'medium',
    description: 'Soccer player kicking the ball'
  },
  {
    id: 'photo-1553778263-73a83bab9b0c',
    filename: 'photo_02.jpg',
    ball_x: 48, ball_y: 65,
    ball_radius: 20,
    difficulty: 'easy',
    description: 'Football field aerial view'
  },
  {
    id: 'photo-1431324155629-1a6deb1dec8d',
    filename: 'photo_03.jpg',
    ball_x: 42, ball_y: 58,
    ball_radius: 22,
    difficulty: 'medium',
    description: 'Soccer match in progress'
  },
  {
    id: 'photo-1560272564-c83b66b1ad12',
    filename: 'photo_04.jpg',
    ball_x: 62, ball_y: 70,
    ball_radius: 28,
    difficulty: 'easy',
    description: 'Football player with the ball'
  },
  {
    id: 'photo-1517466787929-bc90951d0974',
    filename: 'photo_05.jpg',
    ball_x: 50, ball_y: 80,
    ball_radius: 18,
    difficulty: 'hard',
    description: 'Stadium panoramic view'
  },
  {
    id: 'photo-1579952363873-27f3bade9f55',
    filename: 'photo_06.jpg',
    ball_x: 45, ball_y: 55,
    ball_radius: 30,
    difficulty: 'easy',
    description: 'Soccer ball on the field'
  },
  {
    id: 'photo-1511886929837-354d827aae26',
    filename: 'photo_07.jpg',
    ball_x: 38, ball_y: 62,
    ball_radius: 24,
    difficulty: 'medium',
    description: 'Football match action shot'
  },
  {
    id: 'photo-1551958219-acbc608c6377',
    filename: 'photo_08.jpg',
    ball_x: 58, ball_y: 68,
    ball_radius: 26,
    difficulty: 'medium',
    description: 'Soccer player dribbling'
  }
];

// Ensure directories exist
fs.mkdirSync(ORIGINALS_DIR, { recursive: true });
fs.mkdirSync(MODIFIED_DIR, { recursive: true });

/**
 * Download a file following redirects (up to 5 hops)
 */
function downloadFile(url, destPath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const request = protocol.get(url, { timeout: 15000 }, (res) => {
      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
        return downloadFile(res.headers.location, destPath, maxRedirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
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

/**
 * Generate a realistic football field SVG placeholder at 800x600
 */
function generatePlaceholderSVG(index) {
  // Vary the scenes for each placeholder
  const scenes = [
    // Scene 1: Player kicking (silhouette on green field)
    { skyColor: '#4a90d9', grassColor: '#2d8a4e', grassColor2: '#35a05a',
      elements: `
        <rect x="0" y="320" width="800" height="5" fill="white" opacity="0.6"/>
        <line x1="400" y1="250" x2="400" y2="600" stroke="white" stroke-width="2" opacity="0.4"/>
        <circle cx="400" cy="400" r="60" stroke="white" stroke-width="2" fill="none" opacity="0.4"/>
        <ellipse cx="440" cy="430" rx="12" ry="12" fill="#222"/>
        <g transform="translate(380,350)" fill="#1a1a2e">
          <ellipse cx="0" cy="0" rx="12" ry="16"/>
          <rect x="-6" y="16" width="12" height="30" rx="3"/>
          <rect x="-18" y="20" width="12" height="4" rx="2" transform="rotate(-30,-18,22)"/>
          <rect x="6" y="20" width="15" height="4" rx="2" transform="rotate(45,6,22)"/>
          <rect x="-5" y="46" width="5" height="25" rx="2" transform="rotate(-5,-2,46)"/>
          <rect x="0" y="46" width="5" height="25" rx="2" transform="rotate(20,2,46)"/>
        </g>` },
    // Scene 2: Wide field view with goal
    { skyColor: '#5b9bd5', grassColor: '#1e7a3a', grassColor2: '#28924a',
      elements: `
        <rect x="0" y="300" width="800" height="4" fill="white" opacity="0.5"/>
        <rect x="300" y="260" width="200" height="140" stroke="white" stroke-width="3" fill="none" opacity="0.7"/>
        <rect x="350" y="290" width="100" height="80" stroke="white" stroke-width="2" fill="none" opacity="0.5"/>
        <line x1="300" y1="260" x2="350" y2="240" stroke="white" stroke-width="2" opacity="0.6"/>
        <line x1="500" y1="260" x2="450" y2="240" stroke="white" stroke-width="2" opacity="0.6"/>
        <line x1="350" y1="240" x2="450" y2="240" stroke="white" stroke-width="2" opacity="0.6"/>
        <circle cx="385" cy="390" r="10" fill="#eee" stroke="#aaa" stroke-width="1"/>` },
    // Scene 3: Two players contesting
    { skyColor: '#6ba3d6', grassColor: '#2a8545', grassColor2: '#32994f',
      elements: `
        <rect x="0" y="340" width="800" height="4" fill="white" opacity="0.4"/>
        <circle cx="400" cy="420" r="70" stroke="white" stroke-width="2" fill="none" opacity="0.3"/>
        <g transform="translate(340,310)" fill="#c0392b">
          <ellipse cx="0" cy="0" rx="10" ry="14"/>
          <rect x="-5" y="14" width="10" height="28" rx="3"/>
          <rect x="-4" y="42" width="4" height="22" rx="2"/>
          <rect x="0" y="42" width="4" height="22" rx="2" transform="rotate(10,2,42)"/>
        </g>
        <g transform="translate(420,320)" fill="#2c3e50">
          <ellipse cx="0" cy="0" rx="10" ry="14"/>
          <rect x="-5" y="14" width="10" height="28" rx="3"/>
          <rect x="-4" y="42" width="4" height="22" rx="2"/>
          <rect x="0" y="42" width="4" height="22" rx="2" transform="rotate(-10,2,42)"/>
        </g>
        <circle cx="380" cy="400" r="9" fill="#eee" stroke="#bbb" stroke-width="1"/>` },
    // Scene 4: Close-up player with ball
    { skyColor: '#87CEEB', grassColor: '#228B22', grassColor2: '#2ca62c',
      elements: `
        <rect x="0" y="380" width="800" height="3" fill="white" opacity="0.3"/>
        <g transform="translate(350,250)" fill="#1a237e">
          <ellipse cx="0" cy="0" rx="18" ry="24"/>
          <rect x="-12" y="24" width="24" height="50" rx="5"/>
          <rect x="-30" y="30" width="20" height="6" rx="3" transform="rotate(-20,-30,33)"/>
          <rect x="10" y="30" width="22" height="6" rx="3" transform="rotate(30,10,33)"/>
          <rect x="-10" y="74" width="9" height="40" rx="3" transform="rotate(-5,-5,74)"/>
          <rect x="1" y="74" width="9" height="40" rx="3" transform="rotate(15,5,74)"/>
        </g>
        <circle cx="500" cy="420" r="14" fill="#f0f0f0" stroke="#999" stroke-width="1.5"/>
        <path d="M497,416 l6,0 l2,5 l-2,5 l-6,0 l-2,-5z" fill="#333" opacity="0.5"/>` },
    // Scene 5: Stadium wide shot
    { skyColor: '#4682B4', grassColor: '#1a7535', grassColor2: '#208c40',
      elements: `
        <rect x="0" y="200" width="800" height="400" fill="url(#stands)"/>
        <rect x="0" y="350" width="800" height="250" fill="#1a7535"/>
        <rect x="50" y="200" width="700" height="150" fill="#555" opacity="0.6"/>
        <rect x="60" y="210" width="680" height="130" fill="#666" opacity="0.4"/>
        <rect x="0" y="350" width="800" height="3" fill="white" opacity="0.5"/>
        <line x1="400" y1="350" x2="400" y2="600" stroke="white" stroke-width="2" opacity="0.3"/>
        <circle cx="400" cy="475" r="50" stroke="white" stroke-width="2" fill="none" opacity="0.3"/>
        <rect x="20" y="380" width="120" height="80" stroke="white" stroke-width="2" fill="none" opacity="0.4"/>
        <rect x="660" y="380" width="120" height="80" stroke="white" stroke-width="2" fill="none" opacity="0.4"/>
        <circle cx="400" cy="480" r="8" fill="#eee"/>` },
    // Scene 6: Ball on grass close-up
    { skyColor: '#78B7D0', grassColor: '#1e8c3a', grassColor2: '#25a045',
      elements: `
        <rect x="0" y="250" width="800" height="350" fill="#1e8c3a"/>
        <line x1="0" y1="350" x2="800" y2="350" stroke="white" stroke-width="3" opacity="0.6"/>
        <circle cx="360" cy="330" r="28" fill="#f5f5f5" stroke="#ccc" stroke-width="2"/>
        <path d="M352,320 l16,0 l5,12 l-8,10 l-10,0 l-8,-10z" fill="#333" opacity="0.6"/>
        <path d="M340,330 l5,-10 l10,2 l2,10 l-8,6z" fill="#333" opacity="0.4"/>
        <path d="M368,322 l8,4 l0,10 l-8,6 l-5,-4z" fill="#333" opacity="0.4"/>` },
    // Scene 7: Match action with multiple players
    { skyColor: '#5DADE2', grassColor: '#27ae60', grassColor2: '#2ecc71',
      elements: `
        <rect x="0" y="310" width="800" height="4" fill="white" opacity="0.5"/>
        <g transform="translate(200,270)" fill="#e74c3c"><ellipse cx="0" cy="0" rx="9" ry="13"/><rect x="-4" y="13" width="8" height="24" rx="2"/><rect x="-3" y="37" width="3" height="20" rx="1"/><rect x="0" y="37" width="3" height="20" rx="1"/></g>
        <g transform="translate(320,280)" fill="#e74c3c"><ellipse cx="0" cy="0" rx="9" ry="13"/><rect x="-4" y="13" width="8" height="24" rx="2"/><rect x="-3" y="37" width="3" height="20" rx="1"/><rect x="0" y="37" width="3" height="20" rx="1"/></g>
        <g transform="translate(260,260)" fill="#2c3e50"><ellipse cx="0" cy="0" rx="9" ry="13"/><rect x="-4" y="13" width="8" height="24" rx="2"/><rect x="-3" y="37" width="3" height="20" rx="1"/><rect x="0" y="37" width="3" height="20" rx="1"/></g>
        <g transform="translate(380,275)" fill="#2c3e50"><ellipse cx="0" cy="0" rx="9" ry="13"/><rect x="-4" y="13" width="8" height="24" rx="2"/><rect x="-3" y="37" width="3" height="20" rx="1"/><rect x="0" y="37" width="3" height="20" rx="1"/></g>
        <circle cx="305" cy="370" r="9" fill="#f0f0f0" stroke="#aaa" stroke-width="1"/>` },
    // Scene 8: Player dribbling
    { skyColor: '#85C1E9', grassColor: '#229940', grassColor2: '#2ab34d',
      elements: `
        <rect x="0" y="330" width="800" height="3" fill="white" opacity="0.4"/>
        <g transform="translate(400,240)" fill="#8e44ad">
          <ellipse cx="0" cy="0" rx="14" ry="20"/>
          <rect x="-8" y="20" width="16" height="38" rx="4"/>
          <rect x="-24" y="26" width="16" height="5" rx="2" transform="rotate(-25,-24,28)"/>
          <rect x="8" y="26" width="18" height="5" rx="2" transform="rotate(15,8,28)"/>
          <rect x="-7" y="58" width="6" height="32" rx="2" transform="rotate(-8,-4,58)"/>
          <rect x="1" y="58" width="6" height="32" rx="2" transform="rotate(20,4,58)"/>
        </g>
        <circle cx="465" cy="408" r="11" fill="#f0f0f0" stroke="#bbb" stroke-width="1.5"/>
        <path d="M461,404 l8,0 l3,6 l-3,6 l-8,0 l-3,-6z" fill="#333" opacity="0.5"/>` }
  ];

  const scene = scenes[index];

  // Build grass stripes for realism
  let grassStripes = '';
  const stripeStart = index === 5 ? 250 : (index === 4 ? 350 : 300);
  for (let y = stripeStart; y < 600; y += 30) {
    const color = (Math.floor((y - stripeStart) / 30) % 2 === 0) ? scene.grassColor : scene.grassColor2;
    grassStripes += `<rect x="0" y="${y}" width="800" height="30" fill="${color}"/>`;
  }

  return `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${scene.skyColor}"/>
        <stop offset="100%" stop-color="#b8d4e8"/>
      </linearGradient>
      <radialGradient id="sun" cx="80%" cy="15%">
        <stop offset="0%" stop-color="#fff9c4" stop-opacity="0.8"/>
        <stop offset="100%" stop-color="#fff9c4" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="800" height="600" fill="url(#sky)"/>
    <circle cx="640" cy="90" r="120" fill="url(#sun)"/>
    ${grassStripes}
    ${scene.elements}
  </svg>`;
}

/**
 * Erase the ball from the image using sharp
 */
async function eraseBall(inputPath, outputPath, ballXPercent, ballYPercent, radiusPx) {
  const metadata = await sharp(inputPath).metadata();
  const imgW = metadata.width || 800;
  const imgH = metadata.height || 600;

  // Convert percentage to pixel coordinates
  const ballCx = Math.round(imgW * ballXPercent / 100);
  const ballCy = Math.round(imgH * ballYPercent / 100);
  const radius = radiusPx || 30;
  const patchSize = radius * 2 + 10;

  // Offset direction: pick a direction that stays in bounds
  let offsetX = -50, offsetY = -20;
  if (ballCx - 50 < patchSize / 2) offsetX = 50;
  if (ballCy - 20 < patchSize / 2) offsetY = 50;

  // Clamp the source patch extraction region
  const srcLeft = Math.max(0, Math.min(imgW - patchSize, ballCx + offsetX - Math.floor(patchSize / 2)));
  const srcTop = Math.max(0, Math.min(imgH - patchSize, ballCy + offsetY - Math.floor(patchSize / 2)));

  // Extract a patch from offset area and blur it
  const patch = await sharp(inputPath)
    .extract({ left: srcLeft, top: srcTop, width: patchSize, height: patchSize })
    .blur(2.5)
    .toBuffer();

  // Create a circular mask as SVG
  const maskSvg = Buffer.from(
    `<svg width="${patchSize}" height="${patchSize}">
      <circle cx="${patchSize / 2}" cy="${patchSize / 2}" r="${radius}" fill="white"/>
    </svg>`
  );

  // Apply the circular mask to the patch
  const maskedPatch = await sharp(patch)
    .composite([{ input: maskSvg, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // Calculate where to place the patch (centered on ball position)
  const compLeft = Math.max(0, Math.min(imgW - patchSize, ballCx - Math.floor(patchSize / 2)));
  const compTop = Math.max(0, Math.min(imgH - patchSize, ballCy - Math.floor(patchSize / 2)));

  // Composite the masked patch over the original image at the ball position
  await sharp(inputPath)
    .composite([{
      input: maskedPatch,
      left: compLeft,
      top: compTop,
      blend: 'over'
    }])
    .jpeg({ quality: 90 })
    .toFile(outputPath);
}

async function main() {
  console.log('=== Find the Ball - Photo Processor ===\n');

  const results = [];

  for (let i = 0; i < PHOTOS.length; i++) {
    const photo = PHOTOS[i];
    const origPath = path.join(ORIGINALS_DIR, photo.filename);
    const modPath = path.join(MODIFIED_DIR, photo.filename);
    const url = `https://images.unsplash.com/${photo.id}?w=800&h=600&fit=crop`;

    console.log(`[${i + 1}/8] Downloading ${photo.filename}...`);

    let downloaded = false;
    try {
      await downloadFile(url, origPath);
      // Verify it's a valid image
      const meta = await sharp(origPath).metadata();
      if (meta.width && meta.height) {
        downloaded = true;
        console.log(`  ✓ Downloaded (${meta.width}x${meta.height})`);
      }
    } catch (err) {
      console.log(`  ✗ Download failed: ${err.message}`);
    }

    if (!downloaded) {
      console.log(`  → Generating placeholder...`);
      try {
        const svg = generatePlaceholderSVG(i);
        await sharp(Buffer.from(svg))
          .jpeg({ quality: 92 })
          .toFile(origPath);
        console.log(`  ✓ Placeholder created`);
      } catch (err) {
        console.log(`  ✗ Placeholder failed: ${err.message}`);
        continue;
      }
    }

    // Erase the ball
    console.log(`  Processing ball erasure...`);
    try {
      await eraseBall(origPath, modPath, photo.ball_x, photo.ball_y, photo.ball_radius);
      console.log(`  ✓ Modified version saved`);
      results.push(photo);
    } catch (err) {
      console.log(`  ✗ Erasure failed: ${err.message}`);
      // Copy original as modified fallback
      try {
        fs.copyFileSync(origPath, modPath);
        results.push(photo);
        console.log(`  → Copied original as fallback`);
      } catch (e) {
        console.log(`  ✗ Could not copy fallback: ${e.message}`);
      }
    }

    console.log('');
  }

  // Update database
  console.log('Updating database...');
  try {
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    db.pragma('foreign_keys = OFF');
    db.prepare('DELETE FROM game_rounds').run();
    db.prepare('DELETE FROM photos').run();
    db.pragma('foreign_keys = ON');
    console.log('  Cleared existing photos and related game rounds.');

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
    const count = db.prepare('SELECT COUNT(*) as cnt FROM photos').get();
    console.log(`  Database now has ${count.cnt} photos.`);
    db.close();
  } catch (err) {
    console.error('Database error:', err.message);
  }

  console.log(`\n=== Done! ${results.length}/8 photos processed ===`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
