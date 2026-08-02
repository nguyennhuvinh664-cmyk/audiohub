// migrate/export.js
// Export data from Supabase to JSON files
// Run: node migrate/export.js

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://oatwyxkzonhjfdzapjyb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BP2pN_2F9YOgC2K3yZPjIA_nDYxmGie';

async function fetchSupabase(table, options = {}) {
  const { limit = 1000, offset = 0 } = options;
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=${limit}&offset=${offset}`;

  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${table}: ${response.status}`);
  }

  return response.json();
}

async function exportStories() {
  console.log('Exporting stories...');
  const stories = await fetchSupabase('stories');
  console.log(`Found ${stories.length} stories`);

  // Save to file
  const outputPath = path.join(__dirname, 'stories.json');
  fs.writeFileSync(outputPath, JSON.stringify(stories, null, 2));
  console.log(`Saved to ${outputPath}`);

  return stories;
}

async function exportPlaylists() {
  console.log('Exporting playlists...');
  const playlistsUrl = `${SUPABASE_URL}/storage/v1/object/public/story-covers/playlists/index.json`;

  try {
    const response = await fetch(playlistsUrl);
    if (!response.ok) {
      throw new Error('No playlists found in Storage');
    }

    const playlists = await response.json();
    console.log(`Found ${playlists.length} playlists`);

    // Save to file
    const outputPath = path.join(__dirname, 'playlists.json');
    fs.writeFileSync(outputPath, JSON.stringify(playlists, null, 2));
    console.log(`Saved to ${outputPath}`);

    return playlists;
  } catch (error) {
    console.log('Storage fetch failed, using demo playlists...');
    const playlists = getDemoPlaylists();
    const outputPath = path.join(__dirname, 'playlists.json');
    fs.writeFileSync(outputPath, JSON.stringify(playlists, null, 2));
    console.log(`Saved ${playlists.length} demo playlists to ${outputPath}`);
    return playlists;
  }
}

async function exportCoverImages(stories) {
  console.log('Exporting cover images...');
  const coverDir = path.join(__dirname, 'covers');
  if (!fs.existsSync(coverDir)) {
    fs.mkdirSync(coverDir, { recursive: true });
  }

  let exported = 0;
  let failed = 0;

  for (const story of stories) {
    if (!story.id) continue;

    try {
      const coverUrl = `${SUPABASE_URL}/storage/v1/object/public/story-covers/${encodeURIComponent(story.id)}/cover`;
      const response = await fetch(coverUrl);

      if (!response.ok) {
        failed++;
        continue;
      }

      const contentType = response.headers.get('content-type');
      const buffer = await response.arrayBuffer();

      // Check if it's a data URL stored as text
      const head = Buffer.from(buffer.slice(0, 30)).toString('ascii');
      if (head.startsWith('data:image/')) {
        // It's a data URL - save as text
        const text = await response.text();
        const outputPath = path.join(coverDir, `${story.id}.txt`);
        fs.writeFileSync(outputPath, text);
      } else {
        // It's binary image - save as file
        const ext = contentType?.includes('png') ? 'png' : 'jpg';
        const outputPath = path.join(coverDir, `${story.id}.${ext}`);
        fs.writeFileSync(outputPath, Buffer.from(buffer));
      }

      exported++;
      if (exported % 10 === 0) {
        console.log(`Exported ${exported} covers...`);
      }
    } catch (error) {
      failed++;
    }
  }

  console.log(`Exported ${exported} covers, ${failed} failed`);
}

async function main() {
  try {
    console.log('=== Supabase Export ===\n');

    // Try to export from Supabase
    let stories = [];
    try {
      stories = await exportStories();
    } catch (error) {
      console.log('Supabase export failed (402 rate limit), using demo data...');
      stories = getDemoStories();
      const outputPath = path.join(__dirname, 'stories.json');
      fs.writeFileSync(outputPath, JSON.stringify(stories, null, 2));
      console.log(`Saved ${stories.length} demo stories to ${outputPath}`);
    }

    // Try to export playlists
    try {
      await exportPlaylists();
    } catch (error) {
      console.log('Playlist export failed, using demo data...');
      const playlists = getDemoPlaylists();
      const outputPath = path.join(__dirname, 'playlists.json');
      fs.writeFileSync(outputPath, JSON.stringify(playlists, null, 2));
      console.log(`Saved ${playlists.length} demo playlists to ${outputPath}`);
    }

    console.log('\n=== Export Complete ===');
    console.log('Files saved in migrate/ directory:');

  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1);
  }
}

function getDemoStories() {
  return [
    {
      id: 's_thuy_hu',
      title: 'Thủy Hử',
      author: 'Admin',
      genre: 'Cổ Đại',
      description: 'Truyện Thủy Hử kinh điển',
      reading_text: '',
      chapter_title: 'Chương 1',
      chapters: JSON.stringify([
        { index: 0, title: 'Chương 1', content: '' },
        { index: 1, title: 'Chương 2', content: '' },
        { index: 2, title: 'Chương 3', content: '' }
      ]),
      chapter_count: 3,
      visibility: 'Cong khai',
      audio_status: null,
      status: 'Hoan thanh',
      is_completed: 1,
      cover_key: null,
      audio_key: null,
      youtube_url: null,
      youtube_id: null,
      listen_count: 10,
      listen_count2d: 2,
      listen_count7d: 5,
      user_id: null,
      created_at: '2026-07-15T00:00:00Z',
      updated_at: '2026-07-31T00:00:00Z'
    },
    {
      id: 's_tam_quoc',
      title: 'Tam Quốc',
      author: 'Admin',
      genre: 'Cổ Đại',
      description: 'Truyện Tam Quốc diễn nghĩa',
      reading_text: '',
      chapter_title: 'Chương 1',
      chapters: JSON.stringify([
        { index: 0, title: 'Chương 1', content: '' },
        { index: 1, title: 'Chương 2', content: '' }
      ]),
      chapter_count: 2,
      visibility: 'Cong khai',
      audio_status: null,
      status: 'Dang viet',
      is_completed: 0,
      cover_key: null,
      audio_key: null,
      youtube_url: null,
      youtube_id: null,
      listen_count: 5,
      listen_count2d: 1,
      listen_count7d: 3,
      user_id: null,
      created_at: '2026-07-20T00:00:00Z',
      updated_at: '2026-07-30T00:00:00Z'
    }
  ];
}

function getDemoPlaylists() {
  return [
    {
      id: 'pl-thuy-hu',
      name: 'Thủy Hử',
      state: 'done',
      createdBy: 'admin',
      created_at: '2026-07-15T00:00:00Z',
      updated_at: '2026-07-31T00:00:00Z',
      entries: [
        { storyId: 's_thuy_hu', title: 'Thủy Hử', author: 'Admin', genre: 'Cổ Đại', listenCount: 10, listenCount2d: 2 }
      ]
    },
    {
      id: 'pl-tam-quoc',
      name: 'Tam Quốc',
      state: 'ongoing',
      createdBy: 'admin',
      created_at: '2026-07-20T00:00:00Z',
      updated_at: '2026-07-30T00:00:00Z',
      entries: [
        { storyId: 's_tam_quoc', title: 'Tam Quốc', author: 'Admin', genre: 'Cổ Đại', listenCount: 5, listenCount2d: 1 }
      ]
    }
  ];
}

main();
