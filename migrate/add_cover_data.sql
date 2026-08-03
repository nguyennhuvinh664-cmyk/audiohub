-- Migration: Add cover_data column to stories table
-- Run: wrangler d1 execute audiohub-db --file=migrate/add_cover_data.sql

ALTER TABLE stories ADD COLUMN cover_data TEXT;
