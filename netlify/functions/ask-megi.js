import Anthropic from '@anthropic-ai/sdk';

export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { documentData, question, fileName, conversationHistory = [] } = JSON.parse(event.body || '{}');

    if (!documentData || !question) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing documentData or question' }) };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured.' }) };
    }

    const client = new Anthropic({ apiKey });

    const SYSTEM_PROMPT = `You are Jessica, an expert AI document analyst. You have already read and analyzed a document, and the user is now asking you a follow-up question about it.

Be direct, practical, and conversational — like a knowledgeable colleague giving real advice, not a lawyer covering all bases.

If the user asks for a recommendation (like a counter-offer strategy, negotiation points, red flags to push back on, etc.), give them a concrete, actionable answer grounded in the document details you analyzed. Don't hedge excessively — the user wants your actual opinion.

Keep responses clear and readable. Use short paragraphs or brief bullet points where it helps. Aim for 150-400 words unless the question genuinely requires more.`;

    // Build the context message that sets up what Jessica already knows
    const docContext = `I've already analyzed this document for you. Here's what I found:

**File:** ${fileName || 'Document'}
**Type:** ${documentData.documentType || 'Unknown'}
**Category:** ${documentData.documentCategory || 'Unknown'}

**Summary:** ${documentData.summary || 'No summary available.'}

**Key Parties:** ${documentData.parties?.map(p => `${p.name} (${p.role})`).join(', ') || 'None identified'}

**Key Amounts:** ${documentData.keyAmounts?.map(a => `${a.label}: ${a.amount} ${a.currency || ''}`).join(', ') || 'None identified'}

**Key Dates:** ${documentData.keyDates?.map(d => `${d.label}: ${d.date}`).join(', ') || 'None identified'}

**Notable Flags:** ${documentData.flags?.join(' | ') || 'None'}

**Obligations:** ${documentData.obligations?.map(o => `${o.party}: ${o.obligation}`).join(' | ') || 'None identified'}

**Rights:** ${documentData.rights?.map(r => `${r.party}: ${r.right}`).join(' | ') || 'None identified'}

**Restrictions:** ${documentData.restrictions?.join(' | ') || 'None identified'}

Full analysis data: ${JSON.stringify(documentData, null, 2)}`;

    // Build messages array — include prior conversation if any
    const messages = [
      { role: 'user', content: docContext },
      { role: 'assistant', content: "Got it — I've reviewed everything. What would you like to know?" },
      ...conversationHistory,
      { role: 'user', content: question },
    ];

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    const answer = message.content[0].text.trim();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, answer }),
    };
  } catch (err) {
    console.error('ask-jessica error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal server error' }),
    };
  }
};
