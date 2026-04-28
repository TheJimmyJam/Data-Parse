const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  const jobId = event.queryStringParameters?.jobId;
  if (!jobId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing jobId' }) };

  try {
    const res = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/parse_jobs?id=eq.${encodeURIComponent(jobId)}&select=status,result,error`,
      {
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        },
      }
    );

    if (!res.ok) {
      console.error('Supabase read error:', res.status, await res.text());
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ status: 'pending' }) };
    }

    const rows = await res.json();
    const job = rows[0];

    if (!job) return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ status: 'pending' }) };

    if (job.status === 'error') {
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ status: 'error', error: job.error || 'Processing failed' }) };
    }

    if (job.status === 'done' && job.result) {
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({
          status: 'done',
          result: job.result.data,
          meta: job.result.meta,
        }),
      };
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ status: 'pending' }) };

  } catch (err) {
    console.error('get-result error:', err.message);
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ status: 'pending' }) };
  }
};
