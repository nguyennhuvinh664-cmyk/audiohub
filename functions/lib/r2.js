// functions/lib/r2.js
// R2 Storage helper functions

/**
 * Get cover image from R2
 */
export async function getCover(r2, storyId) {
  // Check if R2 is available
  if (!r2 || !r2.COVERS) {
    console.log('[r2] R2 not available, returning null');
    return null;
  }

  try {
    const key = `${storyId}/cover`;
    const object = await r2.COVERS.get(key);

    if (!object) return null;

    const contentType = object.httpMetadata?.contentType || 'image/jpeg';
    const body = await object.arrayBuffer();

    return new Response(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (e) {
    console.error('[r2] getCover error:', e);
    return null;
  }
}

/**
 * Upload cover image to R2
 */
export async function uploadCover(r2, storyId, file) {
  const key = `${storyId}/cover`;
  const contentType = file.type || 'image/jpeg';

  await r2.COVERS.put(key, file.stream(), {
    httpMetadata: { contentType }
  });

  return { success: true, key };
}

/**
 * Delete cover image from R2
 */
export async function deleteCover(r2, storyId) {
  const key = `${storyId}/cover`;
  await r2.COVERS.delete(key);
  return { success: true };
}

/**
 * Get audio file from R2
 */
export async function getAudio(r2, storyId) {
  if (!r2 || !r2.AUDIO) {
    console.log('[r2] AUDIO binding not available');
    return null;
  }
  const key = `${storyId}.mp3`;
  const object = await r2.AUDIO.get(key);

  if (!object) return null;

  const contentType = object.httpMetadata?.contentType || 'audio/mpeg';
  const body = await object.arrayBuffer();

  // Support range requests for audio streaming
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

/**
 * Upload audio file to R2
 */
export async function uploadAudio(r2, storyId, file) {
  if (!r2 || !r2.AUDIO) {
    console.log('[r2] AUDIO binding not available for upload');
    return { success: false, error: 'R2 AUDIO binding not configured' };
  }
  const key = `${storyId}.mp3`;
  const contentType = file.type || 'audio/mpeg';

  await r2.AUDIO.put(key, file.stream(), {
    httpMetadata: { contentType }
  });

  return { success: true, key };
}

/**
 * Delete audio file from R2
 */
export async function deleteAudio(r2, storyId) {
  if (!r2 || !r2.AUDIO) return { success: false };
  const key = `${storyId}.mp3`;
  await r2.AUDIO.delete(key);
  return { success: true };
}
