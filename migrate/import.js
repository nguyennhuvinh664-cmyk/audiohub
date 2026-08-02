// migrate/import.js
// Import data from JSON files to Cloudflare D1 + R2
// Run: wrangler d1 execute audiohub-db --file=migrate/import.js
// Or run directly with: node migrate/import.js (requires wrangler)

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DB_NAME = 'audiohub-db';

function runWrangler(command) {
  console.log(`Running: ${command}`);
  try {
    const result = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    return result;
  } catch (error) {
    console.error(`Command failed: ${error.message}`);
    throw error;
  }
}

async function importStories() {
  console.log('Importing stories...');

  const storiesPath = path.join(__dirname, 'stories.json');
  if (!fs.existsSync(storiesPath)) {
    console.log('No stories.json found, skipping');
    return;
  }

  const stories = JSON.parse(fs.readFileSync(storiesPath, 'utf-8'));
  console.log(`Found ${stories.length} stories to import`);

  // Generate SQL statements
  const sqlStatements = stories.map(story => {
    const {
      id, title, author, genre, description, reading_text,
      chapter_title, chapters, chapter_count, visibility,
      audio_status, status, is_completed, cover_key, audio_key,
      youtube_url, youtube_id, listen_count, listen_count2d,
      listen_count7d, user_id, created_at, updated_at
    } = story;

    // Escape single quotes in strings
    const escapeStr = (s) => s ? String(s).replace(/'/g, "''") : null;
    const escapeJson = (obj) => obj ? JSON.stringify(obj).replace(/'/g, "''") : null;

    return `INSERT OR REPLACE INTO stories (
      id, title, author, genre, description, reading_text,
      chapter_title, chapters, chapter_count, visibility,
      audio_status, status, is_completed, cover_key, audio_key,
      youtube_url, youtube_id, listen_count, listen_count2d,
      listen_count7d, user_id, created_at, updated_at
    ) VALUES (
      '${escapeStr(id)}',
      '${escapeStr(title || 'Truyen moi')}',
      '${escapeStr(author)}',
      '${escapeStr(genre)}',
      '${escapeStr(description)}',
      '${escapeStr(reading_text)}',
      '${escapeStr(chapter_title || 'Chuong 1')}',
      '${escapeJson(chapters)}',
      ${chapter_count || 1},
      '${escapeStr(visibility || 'Private')}',
      '${escapeStr(audio_status)}',
      '${escapeStr(status)}',
      ${is_completed ? 1 : 0},
      '${escapeStr(cover_key)}',
      '${escapeStr(audio_key)}',
      '${escapeStr(youtube_url)}',
      '${escapeStr(youtube_id)}',
      ${listen_count || 0},
      ${listen_count2d || 0},
      ${listen_count7d || 0},
      '${escapeStr(user_id)}',
      '${escapeStr(created_at || new Date().toISOString())}',
      '${escapeStr(updated_at || new Date().toISOString())}'
    );`;
  });

  // Write SQL to file
  const sqlPath = path.join(__dirname, 'import_stories.sql');
  fs.writeFileSync(sqlPath, sqlStatements.join('\n\n'));
  console.log(`Generated ${sqlStatements.length} SQL statements`);
  console.log(`SQL saved to ${sqlPath}`);

  // Execute SQL via wrangler
  try {
    runWrangler(`wrangler d1 execute ${DB_NAME} --file=${sqlPath}`);
    console.log('Stories imported successfully!');
  } catch (error) {
    console.error('Failed to import stories:', error.message);
    console.log('You can run the SQL manually:');
    console.log(`  wrangler d1 execute ${DB_NAME} --file=${sqlPath}`);
  }
}

async function importPlaylists() {
  console.log('Importing playlists...');

  const playlistsPath = path.join(__dirname, 'playlists.json');
  if (!fs.existsSync(playlistsPath)) {
    console.log('No playlists.json found, skipping');
    return;
  }

  const playlists = JSON.parse(fs.readFileSync(playlistsPath, 'utf-8'));
  console.log(`Found ${playlists.length} playlists to import`);

  // Generate SQL statements
  const sqlStatements = playlists.map(playlist => {
    const { id, name, state, createdBy, created_at, updated_at, entries, items } = playlist;

    const escapeStr = (s) => s ? String(s).replace(/'/g, "''") : null;
    const itemsArray = entries || items || [];

    return `INSERT OR REPLACE INTO playlists (
      id, name, state, created_by, created_at, updated_at, items
    ) VALUES (
      '${escapeStr(id)}',
      '${escapeStr(name)}',
      '${escapeStr(state || 'ongoing')}',
      '${escapeStr(createdBy || 'admin')}',
      '${escapeStr(created_at || new Date().toISOString())}',
      '${escapeStr(updated_at || new Date().toISOString())}',
      '${escapeStr(JSON.stringify(itemsArray))}'
    );`;
  });

  // Write SQL to file
  const sqlPath = path.join(__dirname, 'import_playlists.sql');
  fs.writeFileSync(sqlPath, sqlStatements.join('\n\n'));
  console.log(`Generated ${sqlStatements.length} SQL statements`);
  console.log(`SQL saved to ${sqlPath}`);

  // Execute SQL via wrangler
  try {
    runWrangler(`wrangler d1 execute ${DB_NAME} --file=${sqlPath}`);
    console.log('Playlists imported successfully!');
  } catch (error) {
    console.error('Failed to import playlists:', error.message);
    console.log('You can run the SQL manually:');
    console.log(`  wrangler d1 execute ${DB_NAME} --file=${sqlPath}`);
  }
}

async function importCovers() {
  console.log('Importing cover images to R2...');

  const coversDir = path.join(__dirname, 'covers');
  if (!fs.existsSync(coversDir)) {
    console.log('No covers/ directory found, skipping');
    return;
  }

  const files = fs.readdirSync(coversDir);
  console.log(`Found ${files.length} cover files`);

  let uploaded = 0;
  let failed = 0;

  for (const file of files) {
    const storyId = path.parse(file).name;
    const filePath = path.join(coversDir, file);

    try {
      if (file.endsWith('.txt')) {
        // Data URL stored as text - upload as-is
        const dataUrl = fs.readFileSync(filePath, 'utf-8');
        const blob = new Blob([dataUrl], { type: 'text/plain' });

        // Upload via wrangler
        const tempPath = path.join(__dirname, 'temp_cover.txt');
        fs.writeFileSync(tempPath, dataUrl);
        runWrangler(`wrangler r2 object put story-covers/${storyId}/cover --file=${tempPath} --content-type=text/plain`);
        fs.unlinkSync(tempPath);
      } else {
        // Binary image - upload as-is
        const contentType = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
        runWrangler(`wrangler r2 object put story-covers/${storyId}/cover --file=${filePath} --content-type=${contentType}`);
      }

      uploaded++;
      if (uploaded % 10 === 0) {
        console.log(`Uploaded ${uploaded} covers...`);
      }
    } catch (error) {
      failed++;
      console.error(`Failed to upload ${file}:`, error.message);
    }
  }

  console.log(`Uploaded ${uploaded} covers, ${failed} failed`);
}

async function main() {
  try {
    console.log('=== Cloudflare D1 + R2 Import ===\n');

    // Import stories
    await importStories();

    // Import playlists
    await importPlaylists();

    // Import covers
    await importCovers();

    console.log('\n=== Import Complete ===');

  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

main();
