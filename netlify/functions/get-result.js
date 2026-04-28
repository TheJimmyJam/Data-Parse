/* eslint-disable @typescript-eslint/no-var-requires */
const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  const jobId = event.queryStringParameters && event.queryStringParameters.jobId;
  if (!jobId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Missing jobId' }) };

  try {
    const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['GET', jobId]),
    });

    const json = await res.json();
    const result = json.result;

    if (!result) {
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ status: 'pending' }) };
    }

    // result is the JSON string we stored — return it directly as the response body
    return { statusCode: 200, headers: HEADERS, body: result };

  } catch (err) {
    console.error('get-result error:', err);
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ status: 'pending' }) };
  }
};
