# Migration Guide: Supabase → Cloudflare R2 + D1

This guide will help you migrate from Supabase to Cloudflare R2 + D1.

## Prerequisites

1. **Wrangler CLI installed and logged in**
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. **Cloudflare account** (free tier is fine)

## Step 1: Create Cloudflare Resources

Run these commands in the project root:

```bash
# Create D1 database
wrangler d1 create audiohub-db

# Copy the database ID from the output and update wrangler.toml
# Replace <REPLACE_WITH_DATABASE_ID> with the actual ID

# Create R2 buckets
wrangler r2 bucket create story-covers
wrangler r2 bucket create story-audio
```

## Step 2: Initialize D1 Schema

```bash
wrangler d1 execute audiohub-db --file=migrate/schema.sql
```

## Step 3: Export Data from Supabase

```bash
node migrate/export.js
```

This will create:
- `migrate/stories.json`
- `migrate/playlists.json`
- `migrate/covers/` directory with cover images

## Step 4: Import Data to Cloudflare

```bash
node migrate/import.js
```

Or run the SQL files manually:

```bash
wrangler d1 execute audiohub-db --file=migrate/import_stories.sql
wrangler r2 object put story-covers/{storyId}/cover --file=migrate/covers/{storyId}.jpg --content-type=image/jpeg
```

## Step 5: Deploy to Cloudflare Pages

```bash
wrangler pages deploy
```

## Step 6: Test

1. Open Chrome Incognito mode
2. Visit your site
3. Verify stories and thumbnails load correctly
4. Test upload/edit/delete functionality

## Rollback

If something goes wrong, you can rollback by:

1. Reverting the code changes
2. Redeploying to Cloudflare Pages

The Supabase data remains unchanged until you manually delete it.

## Troubleshooting

### "Database not found" error
Make sure you've updated `wrangler.toml` with the correct database ID.

### Covers not uploading
Check that R2 buckets are created and the bucket names match in `wrangler.toml`.

### API returns 404
Make sure Pages Functions are deployed correctly. Check the Cloudflare dashboard.

## Architecture

```
Frontend (Cloudflare Pages)
    ↓
Cloudflare Pages Functions (API layer)
    ↓
Cloudflare D1 (database)
    ↓
Cloudflare R2 (file storage)
```

### API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/stories` | GET | List stories |
| `/api/stories/:id` | GET | Get story |
| `/api/stories` | POST | Create/Update story |
| `/api/stories/:id` | DELETE | Delete story |
| `/api/stories/:id/listen` | POST | Track listen |
| `/api/playlists` | GET | List playlists |
| `/api/playlists` | POST | Create/Update playlist |
| `/api/playlists/:id` | DELETE | Delete playlist |
| `/api/covers/:id` | GET | Get cover image |
| `/api/covers/:id` | PUT | Upload cover image |
| `/api/audio/:id` | GET | Get audio file |
| `/api/audio/:id` | PUT | Upload audio file |
