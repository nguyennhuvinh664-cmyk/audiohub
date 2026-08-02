// functions/api/admin/migrate.js
// Run DB migrations (add missing columns)

export async function onRequest(context) {
  const { env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  try {
    // Add cover_data column if not exists
    await env.DB.prepare(`
      ALTER TABLE stories ADD COLUMN cover_data TEXT
    `).run().catch(() => {}); // ignore if already exists

    return Response.json({ success: true, message: 'Migrations applied' }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
}
