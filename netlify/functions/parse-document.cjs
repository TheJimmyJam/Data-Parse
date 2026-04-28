/* eslint-disable @typescript-eslint/no-var-requires */
const Anthropic = require('@anthropic-ai/sdk');

// ─── PDF Parser ───────────────────────────────────────────────────────────────
async function extractPDF(buffer) {
  const pdfParse = require('pdf-parse/lib/pdf-parse.js');
  const data = await pdfParse(buffer);
  return data.text || '';
}

// ─── Excel / XLSX Parser ──────────────────────────────────────────────────────
function extractExcel(buffer) {
  const XLSX = require('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  let text = '';
  workbook.SheetNames.forEach((sheetName) => {
    const ws = workbook.Sheets[sheetName];
    text += `=== Sheet: ${sheetName} ===\n`;
    text += XLSX.utils.sheet_to_csv(ws);
    text += '\n\n';
  });
  return text;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
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
    const { fileContent, fileName, fileType } = JSON.parse(event.body || '{}');

    if (!fileContent || !fileName) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing fileContent or fileName' }) };
    }

    const buffer = Buffer.from(fileContent, 'base64');
    const lowerName = fileName.toLowerCase();
    let textContent = '';

    // ── Extract text based on file type ──
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
      return {
        statusCode: 422,
        headers,
        body: JSON.stringify({ error: 'Could not extract any text from this file. It may be an image-only scan or encrypted.' }),
      };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured.' }) };
    }

    const client = new Anthropic({ apiKey });

    const SYSTEM_PROMPT = `You are Jessica, an expert AI document analyst. You can read and extract structured data from any kind of document — legal, financial, medical, insurance, historical, government, scientific, corporate, personal, or otherwise.

Your job is to identify what a document is, who the relevant parties are, and what the key data points are — adapting your analysis to whatever type of document you receive.

Always respond with ONLY valid JSON. No markdown fences, no explanation text, just the raw JSON object. If a field has no data, use null for strings or [] for arrays.`;

    const USER_PROMPT = `Analyze the following document and extract all relevant data. Adapt your analysis to the document type — do not force fields that don't apply.

Return ONLY a JSON object with this structure:

{
  "documentType": "Specific document type (e.g. U.S. Constitutional Amendment, Employment Agreement, Insurance Policy, Medical Record, Financial Statement, Academic Paper, Court Ruling, etc.)",
  "documentCategory": "Broad category: Legal | Financial | Medical | Insurance | Government | Historical | Scientific | Corporate | Technical | Personal | Academic | Other",
  "summary": "2-4 sentence plain English summary of what this document is, what it does, and why it matters",
  "confidence": "High | Medium | Low — how confident you are in the document type identification",

  "parties": [
    {
      "name": "Party name",
      "role": "Their specific role in this document (e.g. Grantor, Plaintiff, Employer, Author, Insured, Congress, etc.)",
      "type": "Individual | Organization | Government | Corporation | Institution | Other",
      "contact": "Contact info or address if present, otherwise null",
      "notes": "Any relevant detail about this party, or null"
    }
  ],

  "keyDates": [
    { "label": "What this date represents", "date": "The date value" }
  ],

  "keyAmounts": [
    { "label": "What this amount represents", "amount": "The value", "currency": "USD or applicable currency, or null" }
  ],

  "sections": [
    {
      "title": "Section name, article title, or topic heading",
      "summary": "1-2 sentence summary of what this section covers",
      "keyPoints": [
        "Concise bullet-point key takeaway",
        "Another key takeaway"
      ]
    }
  ],

  "obligations": [
    {
      "party": "Who bears this obligation",
      "obligation": "What they are required to do",
      "deadline": "By when, if specified — otherwise null"
    }
  ],

  "rights": [
    {
      "party": "Who holds this right",
      "right": "What the right grants or protects"
    }
  ],

  "restrictions": [
    "Plain-language description of each restriction, prohibition, exclusion, or limitation found in the document"
  ],

  "definitions": [
    { "term": "Defined term", "definition": "Its definition as stated in the document" }
  ],

  "flags": [
    "Any item that stands out — unusual clauses, missing information, contradictions, expiration concerns, notable risks, historical significance, or anything a careful reader should pay attention to"
  ],

  "tags": ["keyword1", "keyword2", "relevant topic tags for this document"],

  "customFields": {
    "Use this object for any data that is important and specific to this document type but doesn't fit the above schema. Examples: for insurance add policyNumber/coverageLimits, for a court ruling add caseNumber/jurisdiction/verdict, for a medical record add diagnoses/medications, for a scientific paper add methodology/findings/citations, etc."
  }
}

Document filename: ${fileName}

Document content:
${textContent.substring(0, 60000)}`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: USER_PROMPT }],
    });

    const rawResponse = message.content[0].text.trim();

    // Robustly extract JSON: find the outermost { ... } regardless of any
    // surrounding text, markdown fences, or preamble Claude may have added.
    let parsedData;
    try {
      const firstBrace = rawResponse.indexOf('{');
      const lastBrace  = rawResponse.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        throw new Error('No JSON object found in response');
      }
      parsedData = JSON.parse(rawResponse.substring(firstBrace, lastBrace + 1));
    } catch (parseErr) {
      // Graceful fallback: surface the raw text so the user gets something useful
      parsedData = {
        documentType: 'Unknown',
        documentCategory: 'Other',
        summary: rawResponse.substring(0, 2000),
        confidence: 'Low',
        flags: [`Jessica's response could not be parsed as JSON (${parseErr.message}) — partial output shown in summary`],
        parties: [], keyDates: [], keyAmounts: [], sections: [], obligations: [],
        rights: [], restrictions: [], definitions: [], tags: [], customFields: {}
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: parsedData,
        meta: {
          fileName,
          fileType,
          characterCount: textContent.length,
          truncated: textContent.length > 60000,
        },
      }),
    };
  } catch (err) {
    console.error('parse-document error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal server error' }),
    };
  }
};
