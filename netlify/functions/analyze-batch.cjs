/* eslint-disable @typescript-eslint/no-var-requires */
const Anthropic = require('@anthropic-ai/sdk');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { documents } = JSON.parse(event.body || '{}');
    if (!Array.isArray(documents) || documents.length < 2)
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Need at least 2 documents' }) };

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const docList = documents.map((d, i) =>
      `Document ${i + 1}: "${d.fileName}" — ${d.documentType} (${d.documentCategory})\nSummary: ${d.summary}`
    ).join('\n\n');

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `You are reviewing ${documents.length} documents to determine if they are related to each other.

${docList}

Return ONLY a JSON object:
{
  "related": true or false,
  "reason": "1-2 sentence explanation of why they are or are not related",
  "groupName": "If related: a short descriptive name for this collection (e.g. 'Q3 2024 Invoices', 'Smith Case Files', 'Property Insurance Package'). If not related: null.",
  "combinedSummary": "If related: a 3-5 sentence executive summary covering all documents together and what they collectively represent. If not related: null.",
  "keyInsights": ["If related: 3-5 cross-document insights or patterns. If not related: empty array."]
}`
      }]
    });

    const raw = msg.content[0].text.trim();
    const result = JSON.parse(raw.substring(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, ...result }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
