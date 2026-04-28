// Uploads PDF to Supabase Storage so it never hits Netlify's body size limit.
// Auto-creates the bucket if it doesn't exist.

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { fileContent, fileName, jobId } = JSON.parse(event.body || '{}');
    if (!fileContent || !fileName || !jobId) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing fileContent, fileName, or jobId' }) };
    }

    const SB_URL = process.env.SUPABASE_URL;
    const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sbHeaders = { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY };

    // Auto-create bucket if needed (fails silently if already exists)
    await fetch(`${SB_URL}/storage/v1/bucket`, {
      method: 'POST',
      headers: { ...sbHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'pdf-uploads', name: 'pdf-uploads', public: false }),
    });

    const buffer = Buffer.from(fileContent, 'base64');
    const storagePath = `${jobId}/${encodeURIComponent(fileName)}`;

    const uploadRes = await fetch(`${SB_URL}/storage/v1/object/pdf-uploads/${storagePath}`, {
      method: 'POST',
      headers: { ...sbHeaders, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`Storage upload failed (${uploadRes.status}): ${text}`);
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ storagePath }) };
  } catch (err) {
    console.error('upload-pdf error:', err.message);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
