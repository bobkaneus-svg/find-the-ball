const sharp = require('sharp');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ORIGINALS_DIR = path.join(PROJECT_ROOT, 'public', 'photos', 'originals');
const MODIFIED_DIR = path.join(PROJECT_ROOT, 'public', 'photos', 'modified');
const DB_PATH = path.join(PROJECT_ROOT, 'data', 'findtheball.db');

const WIDTH = 800;
const HEIGHT = 600;

// Ensure output directories exist
fs.mkdirSync(ORIGINALS_DIR, { recursive: true });
fs.mkdirSync(MODIFIED_DIR, { recursive: true });

// Demo scene configurations
const demos = [
  {
    filename: 'demo_01.jpg',
    ballX: 62, ballY: 45, difficulty: 'easy',
    description: 'Corner kick scene',
    players: [
      { x: 200, y: 280, w: 40, h: 80, color: '#d42a2a' },
      { x: 500, y: 300, w: 40, h: 80, color: '#1a3a8a' },
      { x: 350, y: 250, w: 40, h: 80, color: '#d42a2a' },
      { x: 600, y: 320, w: 40, h: 80, color: '#1a3a8a' },
    ],
    fieldLines: true,
  },
  {
    filename: 'demo_02.jpg',
    ballX: 25, ballY: 70, difficulty: 'medium',
    description: 'Midfield action',
    players: [
      { x: 100, y: 300, w: 40, h: 80, color: '#ffffff' },
      { x: 300, y: 350, w: 40, h: 80, color: '#ff6600' },
      { x: 450, y: 280, w: 40, h: 80, color: '#ffffff' },
      { x: 550, y: 400, w: 40, h: 80, color: '#ff6600' },
      { x: 650, y: 320, w: 40, h: 80, color: '#ffffff' },
    ],
    fieldLines: true,
  },
  {
    filename: 'demo_03.jpg',
    ballX: 80, ballY: 55, difficulty: 'hard',
    description: 'Goal area scramble',
    players: [
      { x: 500, y: 260, w: 40, h: 80, color: '#0055aa' },
      { x: 560, y: 300, w: 40, h: 80, color: '#cc0000' },
      { x: 620, y: 280, w: 40, h: 80, color: '#0055aa' },
      { x: 680, y: 310, w: 40, h: 80, color: '#cc0000' },
      { x: 540, y: 340, w: 40, h: 80, color: '#0055aa' },
      { x: 700, y: 260, w: 40, h: 80, color: '#cc0000' },
    ],
    fieldLines: true,
  },
  {
    filename: 'demo_04.jpg',
    ballX: 50, ballY: 35, difficulty: 'easy',
    description: 'Kick-off position',
    players: [
      { x: 350, y: 300, w: 40, h: 80, color: '#228b22' },
      { x: 420, y: 300, w: 40, h: 80, color: '#ffd700' },
    ],
    fieldLines: true,
  },
  {
    filename: 'demo_05.jpg',
    ballX: 15, ballY: 60, difficulty: 'medium',
    description: 'Left wing attack',
    players: [
      { x: 60, y: 320, w: 40, h: 80, color: '#8b0000' },
      { x: 150, y: 350, w: 40, h: 80, color: '#00008b' },
      { x: 250, y: 300, w: 40, h: 80, color: '#8b0000' },
    ],
    fieldLines: true,
  },
  {
    filename: 'demo_06.jpg',
    ballX: 70, ballY: 80, difficulty: 'hard',
    description: 'Penalty area chaos',
    players: [
      { x: 400, y: 350, w: 40, h: 80, color: '#ff1493' },
      { x: 500, y: 400, w: 40, h: 80, color: '#4169e1' },
      { x: 550, y: 380, w: 40, h: 80, color: '#ff1493' },
      { x: 600, y: 420, w: 40, h: 80, color: '#4169e1' },
      { x: 480, y: 440, w: 40, h: 80, color: '#ff1493' },
      { x: 650, y: 400, w: 40, h: 80, color: '#4169e1' },
      { x: 520, y: 360, w: 40, h: 80, color: '#ff1493' },
    ],
    fieldLines: true,
  },
  {
    filename: 'demo_07.jpg',
    ballX: 90, ballY: 50, difficulty: 'easy',
    description: 'Goal kick',
    players: [
      { x: 700, y: 300, w: 40, h: 80, color: '#ffcc00' },
      { x: 600, y: 350, w: 40, h: 80, color: '#333333' },
    ],
    fieldLines: true,
  },
  {
    filename: 'demo_08.jpg',
    ballX: 45, ballY: 25, difficulty: 'medium',
    description: 'High ball in the air',
    players: [
      { x: 280, y: 300, w: 40, h: 80, color: '#aa00aa' },
      { x: 350, y: 320, w: 40, h: 80, color: '#00aaaa' },
      { x: 420, y: 280, w: 40, h: 80, color: '#aa00aa' },
      { x: 180, y: 350, w: 40, h: 80, color: '#00aaaa' },
    ],
    fieldLines: true,
  },
  {
    filename: 'demo_09.jpg',
    ballX: 35, ballY: 55, difficulty: 'hard',
    description: 'Dense midfield battle',
    players: [
      { x: 200, y: 280, w: 40, h: 80, color: '#e03030' },
      { x: 250, y: 310, w: 40, h: 80, color: '#3030e0' },
      { x: 300, y: 290, w: 40, h: 80, color: '#e03030' },
      { x: 350, y: 330, w: 40, h: 80, color: '#3030e0' },
      { x: 150, y: 340, w: 40, h: 80, color: '#e03030' },
      { x: 180, y: 300, w: 40, h: 80, color: '#3030e0' },
      { x: 320, y: 350, w: 40, h: 80, color: '#e03030' },
      { x: 270, y: 270, w: 40, h: 80, color: '#3030e0' },
    ],
    fieldLines: true,
  },
  {
    filename: 'demo_10.jpg',
    ballX: 55, ballY: 65, difficulty: 'easy',
    description: 'Open play wide shot',
    players: [
      { x: 100, y: 350, w: 40, h: 80, color: '#006400' },
      { x: 400, y: 300, w: 40, h: 80, color: '#b8860b' },
      { x: 650, y: 320, w: 40, h: 80, color: '#006400' },
    ],
    fieldLines: true,
  },
];

function buildFieldSvg(demo, includeBall) {
  const ballPxX = Math.round((demo.ballX / 100) * WIDTH);
  const ballPxY = Math.round((demo.ballY / 100) * HEIGHT);

  // Sky gradient + grass gradient
  let svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#87CEEB"/>
      <stop offset="100%" stop-color="#b0e0f0"/>
    </linearGradient>
    <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2d8c2d"/>
      <stop offset="100%" stop-color="#1a6b1a"/>
    </linearGradient>
  </defs>

  <!-- Sky -->
  <rect x="0" y="0" width="${WIDTH}" height="200" fill="url(#sky)"/>

  <!-- Grass -->
  <rect x="0" y="200" width="${WIDTH}" height="400" fill="url(#grass)"/>

  <!-- Grass stripes -->
  <rect x="0" y="200" width="${WIDTH}" height="50" fill="#2a8a2a" opacity="0.3"/>
  <rect x="0" y="300" width="${WIDTH}" height="50" fill="#2a8a2a" opacity="0.3"/>
  <rect x="0" y="400" width="${WIDTH}" height="50" fill="#2a8a2a" opacity="0.3"/>
  <rect x="0" y="500" width="${WIDTH}" height="50" fill="#2a8a2a" opacity="0.3"/>

  <!-- Field lines -->
  <line x1="0" y1="200" x2="${WIDTH}" y2="200" stroke="white" stroke-width="2" opacity="0.5"/>
  <circle cx="${WIDTH / 2}" cy="400" r="60" stroke="white" stroke-width="2" fill="none" opacity="0.4"/>
  <line x1="${WIDTH / 2}" y1="200" x2="${WIDTH / 2}" y2="${HEIGHT}" stroke="white" stroke-width="2" opacity="0.3"/>

  <!-- Goal posts (back) -->
  <rect x="10" y="280" width="8" height="150" fill="#dddddd" opacity="0.4"/>
  <rect x="10" y="280" width="80" height="8" fill="#dddddd" opacity="0.4"/>
  <rect x="82" y="280" width="8" height="150" fill="#dddddd" opacity="0.4"/>

  <!-- Goal posts (front) -->
  <rect x="${WIDTH - 90}" y="280" width="8" height="150" fill="#dddddd" opacity="0.4"/>
  <rect x="${WIDTH - 90}" y="280" width="80" height="8" fill="#dddddd" opacity="0.4"/>
  <rect x="${WIDTH - 18}" y="280" width="8" height="150" fill="#dddddd" opacity="0.4"/>
`;

  // Players (body + head)
  for (const p of demo.players) {
    // Shadow
    svg += `  <ellipse cx="${p.x + 20}" cy="${p.y + p.h + 5}" rx="22" ry="6" fill="rgba(0,0,0,0.2)"/>\n`;
    // Body (shirt)
    svg += `  <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h * 0.6}" rx="5" fill="${p.color}"/>\n`;
    // Shorts
    svg += `  <rect x="${p.x + 5}" y="${p.y + p.h * 0.6}" width="${p.w - 10}" height="${p.h * 0.25}" fill="#222222"/>\n`;
    // Legs
    svg += `  <rect x="${p.x + 8}" y="${p.y + p.h * 0.85}" width="8" height="${p.h * 0.15}" fill="#deb887"/>\n`;
    svg += `  <rect x="${p.x + 24}" y="${p.y + p.h * 0.85}" width="8" height="${p.h * 0.15}" fill="#deb887"/>\n`;
    // Head
    svg += `  <circle cx="${p.x + 20}" cy="${p.y - 12}" r="12" fill="#deb887"/>\n`;
    // Hair
    svg += `  <circle cx="${p.x + 20}" cy="${p.y - 18}" r="10" fill="#3a2a1a"/>\n`;
  }

  // Ball
  if (includeBall) {
    svg += `  <circle cx="${ballPxX}" cy="${ballPxY}" r="12" fill="white" stroke="#333" stroke-width="2"/>\n`;
    // Pentagon pattern on ball
    svg += `  <circle cx="${ballPxX}" cy="${ballPxY}" r="4" fill="#333"/>\n`;
    svg += `  <circle cx="${ballPxX - 6}" cy="${ballPxY - 5}" r="2.5" fill="#333"/>\n`;
    svg += `  <circle cx="${ballPxX + 6}" cy="${ballPxY - 5}" r="2.5" fill="#333"/>\n`;
    svg += `  <circle cx="${ballPxX - 6}" cy="${ballPxY + 5}" r="2.5" fill="#333"/>\n`;
    svg += `  <circle cx="${ballPxX + 6}" cy="${ballPxY + 5}" r="2.5" fill="#333"/>\n`;
  }

  svg += `</svg>`;
  return svg;
}

async function main() {
  console.log('Generating 10 demo football photo pairs...\n');

  for (const demo of demos) {
    const originalSvg = buildFieldSvg(demo, true);
    const modifiedSvg = buildFieldSvg(demo, false);

    const originalPath = path.join(ORIGINALS_DIR, demo.filename);
    const modifiedPath = path.join(MODIFIED_DIR, demo.filename);

    await sharp(Buffer.from(originalSvg))
      .jpeg({ quality: 90 })
      .toFile(originalPath);

    await sharp(Buffer.from(modifiedSvg))
      .jpeg({ quality: 90 })
      .toFile(modifiedPath);

    console.log(`  [OK] ${demo.filename}  ball=(${demo.ballX}%, ${demo.ballY}%)  ${demo.difficulty}`);
  }

  // Update database
  console.log('\nUpdating database...');
  const db = new Database(DB_PATH);

  // Clear existing demo photos
  db.prepare("DELETE FROM photos WHERE filename_original LIKE 'demo_%'").run();

  const insert = db.prepare(`
    INSERT INTO photos (filename_original, filename_modified, ball_x, ball_y, ball_radius, difficulty, sport, description, active)
    VALUES (?, ?, ?, ?, 30, ?, 'football', ?, 1)
  `);

  const insertAll = db.transaction((items) => {
    for (const d of items) {
      insert.run(d.filename, d.filename, d.ballX, d.ballY, d.difficulty, d.description);
    }
  });

  insertAll(demos);

  const count = db.prepare("SELECT COUNT(*) AS cnt FROM photos WHERE filename_original LIKE 'demo_%'").get();
  console.log(`Inserted ${count.cnt} demo records into photos table.`);

  db.close();
  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
