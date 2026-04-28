import Anthropic from '@anthropic-ai/sdk';

// ── Supabase helpers ──────────────────────────────────────────────────────────
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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase write failed (${res.status}): ${text}`);
  }
}

// ── Prompt ────────────────────────────────────────────────────────────────────
const SYSTEM = `You are Jessica, an expert AI document analyst. Always respond with ONLY valid JSON — no markdown fences, no explanation text, just the raw JSON object. If a field has no data, use null for strings or [] for arrays.`;

function buildPrompt(fileName) {
  return `Analyze this document and extract all relevant data. Adapt your analysis to the document type.

Return ONLY this JSON structure:
{
  "documentType": "Specific type (e.g. Invoice, Constitutional Amendment, Insurance Policy)",
  "documentCategory": "Legal | Financial | Medical | Insurance | Government | Historical | Scientific | Corporate | Technical | Personal | Academic | Other",
  "summary": "2-4 sentence plain English summary of what this document is and why it matters",
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

// ── Handler ───────────────────────────────────────────────────────────────────
export const handler = async (event) => {
  let jobId;
  try {
    const body = JSON.parse(event.body || '{}');
    jobId = body.jobId;
    const { fileContent, fileName, fileType } = body;
    if (!jobId || !fileContent || !fileName) return;

    await sbUpsert(jobId, { status: 'processing', created_at: new Date().toISOString() });

    const isPDF = fileName.toLowerCase().endsWith('.pdf') || fileType === 'application/pdf';
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    let messageContent;
    if (isPDF) {
      messageContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileContent } },
        { type: 'text', text: buildPrompt(fileName) },
      ];
    } else {
      const text = Buffer.from(fileContent, 'base64').toString('utf-8').substring(0, 60000);
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
      if (start === -1 || end === -1) throw new Error('No JSON object in response');
      result = JSON.parse(raw.substring(start, end + 1));
    } catch (e) {
      result = {
        documentType: 'Unknown', documentCategory: 'Other',
        summary: 'Could not parse the response. Try re-uploading the document.',
        confidence: 'Low', flags: [`Parse error: ${e.message}`],
        parties: [], keyDates: [], keyAmounts: [], sections: [], obligations: [],
        rights: [], restrictions: [], definitions: [], tags: [], customFields: {},
      };
    }

    await sbUpsert(jobId, {
      status: 'done',
      result: { data: result, meta: { fileName, fileType, method: isPDF ? 'native-pdf' : 'text-extraction' } },
    });

  } catch (err) {
    console.error('parse-document-background error:', err.message);
    if (jobId) {
      try { await sbUpsert(jobId, { status: 'error', error: err.message }); } catch (_) {}
    }
  }
};
