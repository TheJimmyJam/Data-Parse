import { getDeployStore } from '@netlify/blobs';

export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const jobId = event.queryStringParameters?.jobId;
  if (!jobId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing jobId' }) };

  try {
    const store = getDeployStore('parse-jobs');
    const data = await store.get(jobId, { type: 'json' });
    if (!data) return { statusCode: 200, headers, body: JSON.stringify({ status: 'pending' }) };
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    console.error('get-result error:', err);
    return { statusCode: 200, headers, body: JSON.stringify({ status: 'pending' }) };
  }
};
