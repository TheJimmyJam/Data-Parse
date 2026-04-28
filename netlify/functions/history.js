const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sbHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SB_KEY}`,
  apikey: SB_KEY,
});

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    // ── GET: load all history, newest first ──────────────────────────────
    if (event.httpMethod === 'GET') {
      const res = await fetch(
        `${SB_URL}/rest/v1/document_history?order=timestamp.desc&limit=40`,
        { headers: sbHeaders() }
      );
      if (!res.ok) throw new Error(`Supabase read failed (${res.status})`);
      const rows = await res.json();
      const history = rows.map(r => ({
        id: r.id,
        timestamp: r.timestamp,
        jobs: r.jobs,
        batchAnalysis: r.batch_analysis || null,
      }));
      return { statusCode: 200, headers: cors, body: JSON.stringify(history) };
    }

    // ── POST: save a new history entry ────────────────────────────────────
    if (event.httpMethod === 'POST') {
      const entry = JSON.parse(event.body || '{}');
      const res = await fetch(`${SB_URL}/rest/v1/document_history`, {
        method: 'POST',
        headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          id: entry.id,
          timestamp: entry.timestamp,
          jobs: entry.jobs,
          batch_analysis: entry.batchAnalysis || null,
        }),
      });
      if (!res.ok) throw new Error(`Supabase write failed (${res.status})`);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    // ── DELETE: clear all history ─────────────────────────────────────────
    if (event.httpMethod === 'DELETE') {
      const res = await fetch(
        `${SB_URL}/rest/v1/document_history?id=not.is.null`,
        { method: 'DELETE', headers: sbHeaders() }
      );
      if (!res.ok) throw new Error(`Supabase delete failed (${res.status})`);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: cors, body: 'Method not allowed' };
  } catch (err) {
    console.error('history fn error:', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
