// Receives PDF base64 from frontend, uploads to Supabase Storage, returns storagePath
// This is a sync function so it runs quickly — just a file upload, not Claude processing

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

    const buffer = Buffer.from(fileContent, 'base64');
    const storagePath = `${jobId}/${fileName}`;

    const res = await fetch(
      `${process.env.SUPABASE_URL}/storage/v1/object/pdf-uploads/${storagePath}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': 'application/pdf',
        },
        body: buffer,
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Storage upload failed (${res.status}): ${text}`);
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ storagePath }) };
  } catch (err) {
    console.error('upload-pdf error:', err.message);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
