import Anthropic from '@anthropic-ai/sdk';

async function sbSet(jobId, payload) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  await fetch(`${url}/rest/v1/parse_jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'apikey': key,
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ id: jobId, ...payload }),
  });
}

export const handler = async (event) => {
  let jobId;
  try {
    const body = JSON.parse(event.body || '{}');
    jobId = body.jobId;
    const { fileContent, fileName, fileType } = body;

    if (!jobId || !fileContent || !fileName) return;

    await sbSet(jobId, { status: 'processing', created_at: new Date().toISOString() });

    const lowerName = fileName.toLowerCase();
    const isPDF = lowerName.endsWith('.pdf') || fileType === 'application/pdf';

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const PROMPT = `Analyze this document and return ONLY a JSON object — no markdown, no explanation:
{
  "documentType": "", "documentCategory": "Legal|Financial|Medical|Insurance|Government|Historical|Scientific|Corporate|Technical|Personal|Academic|Other",
  "summary": "2-4 sentence plain English summary", "confidence": "High|Medium|Low",
  "parties": [{"name":"","role":"","type":"","contact":null,"notes":null}],
  "keyDates": [{"label":"","date":""}],
  "keyAmounts": [{"label":"","amount":"","currency":null}],
  "sections": [{"title":"","summary":"","keyPoints":[""]}],
  "obligations": [{"party":"","obligation":"","deadline":null}],
  "rights": [{"party":"","right":""}],
  "restrictions": [""], "definitions": [{"term":"","definition":""}],
  "flags": [""], "tags": [""], "customFields": {}
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
      let textContent = buffer.toString('utf-8');

      // Excel handling
      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.xlsm')) {
        const { read, utils } = await import('xlsx');
        const workbook = read(buffer, { type: 'buffer' });
        textContent = workbook.SheetNames.map(n => `=== ${n} ===\n${utils.sheet_to_csv(workbook.Sheets[n])}`).join('\n\n');
      }

      if (!textContent?.trim()) {
        await sbSet(jobId, { status: 'error', error: 'Could not extract text from file.' });
        return;
      }
      messageContent = [{ type: 'text', text: `${PROMPT}\n\nDocument content:\n${textContent.substring(0, 60000)}` }];
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: 'You are Jessica, an expert AI document analyst. Respond with ONLY valid JSON — no markdown fences, no extra text.',
      messages: [{ role: 'user', content: messageContent }],
    });

    const raw = message.content[0].text.trim();
    let parsedData;
    try {
      parsedData = JSON.parse(raw.substring(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    } catch (e) {
      parsedData = { documentType: 'Unknown', documentCategory: 'Other', summary: 'Could not parse response.', confidence: 'Low', flags: [`Parse error: ${e.message}`], parties: [], keyDates: [], keyAmounts: [], sections: [], obligations: [], rights: [], restrictions: [], definitions: [], tags: [], customFields: {} };
    }

    await sbSet(jobId, {
      status: 'done',
      result: parsedData,
      meta: { fileName, fileType, method: isPDF ? 'native-pdf' : 'text-extraction' },
    });

  } catch (err) {
    console.error('background error:', err);
    if (jobId) {
      try { await sbSet(jobId, { status: 'error', error: err.message }); } catch {}
    }
  }
};
