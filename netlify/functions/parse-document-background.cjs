/* eslint-disable @typescript-eslint/no-var-requires */
const Anthropic = require('@anthropic-ai/sdk');

// ─── Supabase REST helpers (no client lib — avoids ESM bundling issues) ───────
async function sbUpsert(jobId, payload) {
  const url  = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res  = await fetch(`${url}/rest/v1/parse_jobs`, {
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

// ─── PDF Parser ───────────────────────────────────────────────────────────────
async function extractPDF(buffer) {
  const pdfParse = require('pdf-parse/lib/pdf-parse.js');
  const data = await pdfParse(buffer);
  return data.text || '';
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
    const body     = JSON.parse(event.body || '{}');
    jobId          = body.jobId;
    const { fileContent, fileName, fileType } = body;

    if (!jobId || !fileContent || !fileName) {
      console.error('parse-document-background: missing required fields');
      return;
    }

    // Mark as processing immediately so the poller sees it right away
    await sbUpsert(jobId, {
      status:     'processing',
      created_at: new Date().toISOString(),
    });

    // ── Extract text ──────────────────────────────────────────────────────────
    const buffer    = Buffer.from(fileContent, 'base64');
    const lowerName = fileName.toLowerCase();
    let textContent = '';

    if (lowerName.endsWith('.pdf') || fileType === 'application/pdf') {
      textContent = await extractPDF(buffer);
    } else if (
      lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.xlsm') ||
      fileType.includes('spreadsheet') || fileType.includes('excel')
    ) {
      textContent = extractExcel(buffer);
    } else {
      textContent = buffer.toString('utf-8');
    }

    if (!textContent || textContent.trim().length === 0) {
      await sbUpsert(jobId, {
        status: 'error',
        error:  'Could not extract text. The file may be image-only or encrypted.',
      });
      return;
    }

    // ── Call Claude ───────────────────────────────────────────────────────────
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
      system: `You are Jessica, an expert AI document analyst. You can read and extract structured data from any kind of document — legal, financial, medical, insurance, historical, government, scientific, corporate, personal, or otherwise.

Your job is to identify what a document is, who the relevant parties are, and what the key data points are — adapting your analysis to whatever type of document you receive.

Always respond with ONLY valid JSON. No markdown fences, no explanation text, just the raw JSON object. If a field has no data, use null for strings or [] for arrays.`,
      messages: [{
        role:    'user',
        content: `Analyze the following document and extract all relevant data. Adapt your analysis to the document type — do not force fields that don't apply.

Return ONLY a JSON object with this structure:

{
  "documentType": "Specific document type",
  "documentCategory": "Legal | Financial | Medical | Insurance | Government | Historical | Scientific | Corporate | Technical | Personal | Academic | Other",
  "summary": "2-4 sentence plain English summary",
  "confidence": "High | Medium | Low",
  "parties": [{ "name": "", "role": "", "type": "Individual | Organization | Government | Corporation | Institution | Other", "contact": null, "notes": null }],
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

Document filename: ${fileName}

Document content:
${textContent.substring(0, 60000)}`,
      }],
    });

    // ── Parse JSON robustly ───────────────────────────────────────────────────
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
        flags: [`Parse error: ${e.message}`],
        parties: [], keyDates: [], keyAmounts: [], sections: [],
        obligations: [], rights: [], restrictions: [], definitions: [],
        tags: [], customFields: {},
      };
    }

    // ── Store result ──────────────────────────────────────────────────────────
    await sbUpsert(jobId, {
      status: 'done',
      result: parsedData,
      meta: {
        fileName,
        fileType,
        characterCount: textContent.length,
        truncated: textContent.length > 60000,
      },
    });

  } catch (err) {
    console.error('parse-document-background error:', err);
    if (jobId) {
      await sbUpsert(jobId, {
        status: 'error',
        error:  err.message || 'Internal server error',
      }).catch(() => {}); // best-effort, don't mask original error
    }
  }
};
