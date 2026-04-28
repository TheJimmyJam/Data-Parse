import Anthropic from '@anthropic-ai/sdk';

// ── Supabase: job tracking ─────────────────────────────────────────────────
function sbHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function sbUpsert(id, data) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/parse_jobs`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id, ...data }),
  });
  if (!res.ok) throw new Error(`Supabase write failed (${res.status}): ${await res.text()}`);
}

// ── Supabase: storage ──────────────────────────────────────────────────────
async function downloadFromStorage(storagePath) {
  const res = await fetch(
    `${process.env.SUPABASE_URL}/storage/v1/object/pdf-uploads/${storagePath}`,
    { headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY } }
  );
  if (!res.ok) throw new Error(`Storage download failed (${res.status}): ${await res.text()}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

async function deleteFromStorage(storagePath) {
  await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/pdf-uploads/${storagePath}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY },
  });
}

// ── Prompt ─────────────────────────────────────────────────────────────────
const SYSTEM = `You are Jessica, an expert AI document analyst. Always respond with ONLY valid JSON — no markdown fences, no explanation text, just the raw JSON object.`;

function buildPrompt(fileName) {
  return `Analyze this document and extract all relevant data. Return ONLY this JSON structure:
{
  "documentType": "Specific type",
  "documentCategory": "Legal | Financial | Medical | Insurance | Government | Historical | Scientific | Corporate | Technical | Personal | Academic | Other",
  "summary": "2-4 sentence plain English summary",
  "confidence": "High | Medium | Low",
  "parties": [{ "name": "", "role": "", "type": "Individual|Organization|Government|Corporation|Institution|Other", "contact": null, "notes": null }],
  "keyDates": [{ "label": "", "date": "" }],
  "keyAmounts": [{ "label": "", "amount": "", "currency": null }],
  "sections": [{ "title": "", "summary": "", "keyPoints": [""] }],
  "obligations": [{ "party": "", "obligation": "", "deadline": null }],
  "rights": [{ "party": "", "right": "" }],
  "restrictions": [""],
  "definitions": [{ "term": "", "definition": "" }],
  "flags": [""],
  "tags": [""],
  "customFields": {}
}
Document filename: ${fileName}`;
}

// ── Handler ────────────────────────────────────────────────────────────────
export const handler = async (event) => {
  let jobId, storagePath;
  try {
    const body = JSON.parse(event.body || '{}');
    jobId = body.jobId;
    storagePath = body.storagePath;  // for large PDFs uploaded to Supabase Storage
    const { fileContent, fileName, fileType } = body;

    if (!jobId || !fileName) return;

    await sbUpsert(jobId, { status: 'processing', created_at: new Date().toISOString() });

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Get file content — either from storage path or inline base64
    let base64Content;
    if (storagePath) {
      base64Content = await downloadFromStorage(storagePath);
    } else {
      base64Content = fileContent;
    }

    const isPDF = fileName.toLowerCase().endsWith('.pdf') || fileType === 'application/pdf';
    let messageContent;
    if (isPDF) {
      messageContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Content } },
        { type: 'text', text: buildPrompt(fileName) },
      ];
    } else {
      const text = Buffer.from(base64Content, 'base64').toString('utf-8').substring(0, 60000);
      messageContent = [{ type: 'text', text: buildPrompt(fileName) + '\n\nDocument content:\n' + text }];
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: SYSTEM,
      messages: [{ role: 'user', content: messageContent }],
    });

    const raw = message.content[0].text.trim();
    let result;
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON in response');
      result = JSON.parse(raw.substring(start, end + 1));
    } catch (e) {
      result = {
        documentType: 'Unknown', documentCategory: 'Other',
        summary: 'Could not parse response. Try re-uploading.',
        confidence: 'Low', flags: [`Parse error: ${e.message}`],
        parties: [], keyDates: [], keyAmounts: [], sections: [], obligations: [],
        rights: [], restrictions: [], definitions: [], tags: [], customFields: {},
      };
    }

    await sbUpsert(jobId, {
      status: 'done',
      result: { data: result, meta: { fileName, fileType, method: isPDF ? 'native-pdf' : 'text-extraction' } },
    });

    // Clean up storage file after processing
    if (storagePath) await deleteFromStorage(storagePath).catch(() => {});

  } catch (err) {
    console.error('parse-document-background error:', err.message);
    if (jobId) {
      try { await sbUpsert(jobId, { status: 'error', error: err.message }); } catch (_) {}
    }
    if (storagePath) await deleteFromStorage(storagePath).catch(() => {});
  }
};
