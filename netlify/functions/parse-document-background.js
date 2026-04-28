/* eslint-disable @typescript-eslint/no-var-requires */
const Anthropic = require('@anthropic-ai/sdk');

async function redisSet(key, value) {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['SET', key, JSON.stringify(value), 'EX', '3600']),
  });
  if (!res.ok) throw new Error('Redis SET failed: ' + res.status + ' ' + await res.text());
}

const SYSTEM = 'You are Jessica, an expert AI document analyst. Always respond with ONLY valid JSON — no markdown fences, no explanation text, just the raw JSON object. If a field has no data, use null for strings or [] for arrays.';

function buildPrompt(fileName) {
  return 'Analyze this document and extract all relevant data. Return ONLY a JSON object:\n\n{\n  "documentType": "Specific type",\n  "documentCategory": "Legal | Financial | Medical | Insurance | Government | Historical | Scientific | Corporate | Technical | Personal | Academic | Other",\n  "summary": "2-4 sentence plain English summary",\n  "confidence": "High | Medium | Low",\n  "parties": [{ "name": "", "role": "", "type": "Individual|Organization|Government|Corporation|Institution|Other", "contact": null, "notes": null }],\n  "keyDates": [{ "label": "", "date": "" }],\n  "keyAmounts": [{ "label": "", "amount": "", "currency": null }],\n  "sections": [{ "title": "", "summary": "", "keyPoints": [""] }],\n  "obligations": [{ "party": "", "obligation": "", "deadline": null }],\n  "rights": [{ "party": "", "right": "" }],\n  "restrictions": [""],\n  "definitions": [{ "term": "", "definition": "" }],\n  "flags": [""],\n  "tags": [""],\n  "customFields": {}\n}\n\nDocument filename: ' + fileName;
}

exports.handler = async (event) => {
  let jobId;
  try {
    const body = JSON.parse(event.body || '{}');
    jobId = body.jobId;
    const { fileContent, fileName, fileType } = body;

    if (!jobId || !fileContent || !fileName) return;

    await redisSet(jobId, { status: 'processing', createdAt: new Date().toISOString() });

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
    let parsedData;
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON found');
      parsedData = JSON.parse(raw.substring(start, end + 1));
    } catch (e) {
      parsedData = {
        documentType: 'Unknown', documentCategory: 'Other',
        summary: 'Could not parse response. Try re-uploading the document.',
        confidence: 'Low', flags: ['Parse error: ' + e.message],
        parties: [], keyDates: [], keyAmounts: [], sections: [], obligations: [],
        rights: [], restrictions: [], definitions: [], tags: [], customFields: {},
      };
    }

    await redisSet(jobId, {
      status: 'done',
      result: parsedData,
      meta: { fileName, fileType, method: isPDF ? 'native-pdf' : 'text-extraction' },
    });

  } catch (err) {
    console.error('parse-document-background error:', err);
    if (jobId) {
      try { await redisSet(jobId, { status: 'error', error: err.message }); } catch (_) {}
    }
  }
};
