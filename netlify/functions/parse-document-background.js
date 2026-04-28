import Anthropic from '@anthropic-ai/sdk';
import { getDeployStore } from '@netlify/blobs';

async function setJob(jobId, payload) {
  const store = getDeployStore('parse-jobs');
  await store.setJSON(jobId, payload);
}

export const handler = async (event) => {
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

    const PROMPT = `Analyze this document. Return ONLY valid JSON, no markdown:
{"documentType":"","documentCategory":"Legal|Financial|Medical|Insurance|Government|Historical|Scientific|Corporate|Technical|Personal|Academic|Other","summary":"2-4 sentence summary","confidence":"High|Medium|Low","parties":[{"name":"","role":"","type":"","contact":null,"notes":null}],"keyDates":[{"label":"","date":""}],"keyAmounts":[{"label":"","amount":"","currency":null}],"sections":[{"title":"","summary":"","keyPoints":[""]}],"obligations":[{"party":"","obligation":"","deadline":null}],"rights":[{"party":"","right":""}],"restrictions":[""],"definitions":[{"term":"","definition":""}],"flags":[""],"tags":[""],"customFields":{}}
Document: ${fileName}`;

    let messageContent;
    if (isPDF) {
      messageContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileContent } },
        { type: 'text', text: PROMPT },
      ];
    } else {
      const buffer = Buffer.from(fileContent, 'base64');
      const textContent = buffer.toString('utf-8').substring(0, 60000);
      messageContent = [{ type: 'text', text: `${PROMPT}\n\nContent:\n${textContent}` }];
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: 'You are Jessica, an expert AI document analyst. Respond with ONLY valid JSON — no markdown, no explanation.',
      messages: [{ role: 'user', content: messageContent }],
    });

    const raw = message.content[0].text.trim();
    let parsedData;
    try {
      parsedData = JSON.parse(raw.substring(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    } catch (e) {
      parsedData = { documentType: 'Unknown', documentCategory: 'Other', summary: 'Parse error.', confidence: 'Low', flags: [`Parse error: ${e.message}`], parties: [], keyDates: [], keyAmounts: [], sections: [], obligations: [], rights: [], restrictions: [], definitions: [], tags: [], customFields: {} };
    }

    await setJob(jobId, {
      status: 'done',
      result: parsedData,
      meta: { fileName, fileType, method: isPDF ? 'native-pdf' : 'text-extraction' },
    });

  } catch (err) {
    console.error('background error:', err);
    if (jobId) {
      try { await setJob(jobId, { status: 'error', error: err.message }); } catch {}
    }
  }
};
