-- D1 Schema for AudioHub
-- Run this after creating the database with: wrangler d1 execute audiohub-db --file=migrate/schema.sql

-- Stories table
CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  title TEXT DEFAULT 'Truyen moi',
  author TEXT,
  genre TEXT,
  description TEXT,
  reading_text TEXT,
  chapter_title TEXT DEFAULT 'Chuong 1',
  chapters TEXT, -- JSON string
  chapter_count INTEGER DEFAULT 1,
  visibility TEXT DEFAULT 'Private', -- Public, Private, Khong cong khai
  audio_status TEXT, -- READY, HIDDEN
  status TEXT, -- Hoan thanh, Dang viet, etc.
  is_completed INTEGER DEFAULT 0,
  cover_key TEXT,
  audio_key TEXT,
  youtube_url TEXT,
  youtube_id TEXT,
  listen_count INTEGER DEFAULT 0,
  listen_count2d INTEGER DEFAULT 0,
  listen_count7d INTEGER DEFAULT 0,
  user_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Playlists table (thay vì JSON file trong Storage)
CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  name TEXT,
  state TEXT DEFAULT 'ongoing', -- done, ongoing
  created_by TEXT DEFAULT 'admin',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  items TEXT DEFAULT '[]' -- JSON string của entries array
);

-- Listen events table (để track lượt nghe)
CREATE TABLE IF NOT EXISTS story_listen_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id TEXT NOT NULL,
  user_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_stories_visibility ON stories(visibility);
CREATE INDEX IF NOT EXISTS idx_stories_user_id ON stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_genre ON stories(genre);
CREATE INDEX IF NOT EXISTS idx_stories_listen_count ON stories(listen_count DESC);
CREATE INDEX IF NOT EXISTS idx_stories_updated_at ON stories(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_listen_events_story_id ON story_listen_events(story_id);
