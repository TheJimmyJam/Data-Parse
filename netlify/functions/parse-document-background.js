/* eslint-disable @typescript-eslint/no-var-requires */
const Anthropic = require('@anthropic-ai/sdk');
const { getDeployStore } = require('@netlify/blobs');

async function setJob(jobId, payload) {
  const store = getDeployStore('parse-jobs');
  await store.setJSON(jobId, payload);
}

exports.handler = async (event) => {
  let jobId;
  try {
    const body = JSON.parse(event.body || '{}');
    jobId = body.jobId;
    const { fileContent, fileName, fileType } = body;
    if (!jobId || !fileContent || !fileName) return;

    await setJob(jobId, { status: 'processing', created_at: new Date().toISOString() });

    const lowerName = fileName.toLowerCase();
    const isPDF = lowerName.endsWith('.pdf') || fileType === 'application/pdf';

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const PROMPT = `You are Jessica, an expert AI document analyst. Analyze this document and return ONLY a valid JSON object — no markdown fences, no explanation text, just raw JSON.

Return this structure:
{
  "documentType": "Specific type (e.g. Constitutional Amendment, Invoice, Insurance Policy, etc.)",
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

    let messageContent;
    if (isPDF) {
      messageContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileContent } },
        { type: 'text', text: PROMPT },
      ];
    } else {
      const buffer = Buffer.from(fileContent, 'base64');
      const textContent = buffer.toString('utf-8').substring(0, 60000);
      messageContent = [{ type: 'text', text: `${PROMPT}\n\nDocument content:\n${textContent}` }];
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: 'You are Jessica, an expert AI document analyst. Always respond with ONLY valid JSON. No markdown fences, no explanation text, just the raw JSON object.',
      messages: [{ role: 'user', content: messageContent }],
    });

    const raw = message.content[0].text.trim();
    let parsedData;
    try {
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      parsedData = JSON.parse(raw.substring(firstBrace, lastBrace + 1));
    } catch (e) {
      parsedData = {
        documentType: 'Unknown', documentCategory: 'Other',
        summary: 'Could not parse response. The document may be too complex.',
        confidence: 'Low',
        flags: [`Parse error: ${e.message}`],
        parties: [], keyDates: [], keyAmounts: [], sections: [], obligations: [],
        rights: [], restrictions: [], definitions: [], tags: [], customFields: {}
      };
    }

    await setJob(jobId, {
      status: 'done',
      result: parsedData,
      meta: { fileName, fileType, method: isPDF ? 'native-pdf' : 'text-extraction' },
    });

  } catch (err) {
    console.error('background error:', err);
    if (jobId) {
      try { await setJob(jobId, { status: 'error', error: err.message }); } catch (_) {}
    }
  }
};
