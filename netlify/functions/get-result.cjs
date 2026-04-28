/* eslint-disable @typescript-eslint/no-var-requires */

exports.handler = async (event) => {
  const headers = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':'Content-Type',
    'Access-Control-Allow-Methods':'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const jobId = event.queryStringParameters?.jobId;
  if (!jobId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing jobId' }) };
  }

  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await fetch(
      `${url}/rest/v1/parse_jobs?id=eq.${encodeURIComponent(jobId)}&select=id,status,result,meta,error&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${key}`,
          'apikey':        key,
        },
      }
    );

    if (!res.ok) {
      return { statusCode: 200, headers, body: JSON.stringify({ status: 'pending' }) };
    }

    const rows = await res.json();

    if (!rows || rows.length === 0) {
      // Background function hasn't written the row yet — still starting up
      return { statusCode: 200, headers, body: JSON.stringify({ status: 'pending' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(rows[0]) };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
