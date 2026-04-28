/* eslint-disable @typescript-eslint/no-var-requires */
const Anthropic = require('@anthropic-ai/sdk');

// ─── Supabase REST helpers ────────────────────────────────────────────────────
async function sbUpsert(jobId, payload) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${url}/rest/v1/parse_jobs`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${key}`,
      'apikey':        key,
      'Prefer':        'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ id: jobId, ...payload }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase upsert failed (${res.status}): ${text}`);
  }
}

// ─── Excel Parser ─────────────────────────────────────────────────────────────
function extractExcel(buffer) {
  const XLSX = require('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  let text = '';
  workbook.SheetNames.forEach((name) => {
    text += `=== Sheet: ${name} ===\n`;
    text += XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
    text += '\n\n';
  });
  return text;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  let jobId;
  try {
    const body = JSON.parse(event.body || '{}');
    jobId = body.jobId;
    const { fileContent, fileName, fileType } = body;

    if (!jobId || !fileContent || !fileName) {
      console.error('parse-document-background: missing required fields');
      return;
    }

    await sbUpsert(jobId, { status: 'processing', created_at: new Date().toISOString() });

    const lowerName = fileName.toLowerCase();
    const isPDF = lowerName.endsWith('.pdf') || fileType === 'application/pdf';
    const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.xlsm') ||
      (fileType && (fileType.includes('spreadsheet') || fileType.includes('excel')));

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const PROMPT = `Analyze the following document and extract all relevant data. Adapt your analysis to the document type.

Return ONLY a JSON object:
{
  "documentType": "Specific document type",
  "documentCategory": "Legal | Financial | Medical | Insurance | Government | Historical | Scientific | Corporate | Technical | Personal | Academic | Other",
  "summary": "2-4 sentence plain English summary",
  "confidence": "High | Medium | Low",
  "parties": [{ "name": "", "role": "", "type": "", "contact": null, "notes": null }],
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

    let messageContent;

    if (isPDF) {
      messageContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileContent } },
        { type: 'text', text: PROMPT },
      ];
    } else {
      const buffer = Buffer.from(fileContent, 'base64');
      const textContent = isExcel ? extractExcel(buffer) : buffer.toString('utf-8');

      if (!textContent || textContent.trim().length === 0) {
        await sbUpsert(jobId, { status: 'error', error: 'Could not extract text. The file may be empty or unsupported.' });
        return;
      }

      messageContent = [
        { type: 'text', text: `${PROMPT}\n\nDocument content:\n${textContent.substring(0, 60000)}` },
      ];
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: 'You are Jessica, an expert AI document analyst. Always respond with ONLY valid JSON. No markdown fences, no explanation text.',
      messages: [{ role: 'user', content: messageContent }],
    });

    const raw = message.content[0].text.trim();
    let parsedData;
    try {
      const first = raw.indexOf('{');
      const last  = raw.lastIndexOf('}');
      if (first === -1 || last <= first) throw new Error('No JSON object found');
      parsedData = JSON.parse(raw.substring(first, last + 1));
    } catch (e) {
      parsedData = {
        documentType: 'Unknown', documentCategory: 'Other',
        summary: raw.substring(0, 2000), confidence: 'Low',
        flags: ['Parse error: ' + e.message],
        parties: [], keyDates: [], keyAmounts: [], sections: [],
        obligations: [], rights: [], restrictions: [], definitions: [],
        tags: [], customFields: {},
      };
    }

    await sbUpsert(jobId, {
      status: 'done',
      result: parsedData,
      meta: { fileName, fileType, method: isPDF ? 'native-pdf' : 'text-extraction' },
    });

  } catch (err) {
    console.error('parse-document-background error:', err);
    if (jobId) {
      await sbUpsert(jobId, { status: 'error', error: err.message || 'Internal server error' }).catch(() => {});
    }
  }
};
