// functions/api/stories/batch.js
// Batch fetch stories by IDs with selected fields

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const idsParam = url.searchParams.get('ids') || '';
    const fieldsParam = url.searchParams.get('fields') || 'id,cover_data,chapter_title,chapters';

    if (!idsParam) {
      return Response.json({ error: 'ids parameter required' }, { status: 400, headers: corsHeaders });
    }

    const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
    if (!ids.length) {
      return Response.json([], { headers: corsHeaders });
    }

    // Build safe field list
    const allowedFields = ['id', 'cover_data', 'chapter_title', 'chapters', 'title', 'genre', 'author', 'audio_key'];
    const fields = fieldsParam.split(',').map(s => s.trim()).filter(f => allowedFields.includes(f));
    if (!fields.length) fields.push('id');

    const placeholders = ids.map(() => '?').join(',');
    const query = `SELECT ${fields.join(', ')} FROM stories WHERE id IN (${placeholders})`;

    const result = await env.DB.prepare(query).bind(...ids).all();

    return Response.json(result.results || [], { headers: corsHeaders });
  } catch (e) {
    console.error('[batch] Error:', e);
    return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
  }
}
