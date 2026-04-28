/* eslint-disable @typescript-eslint/no-var-requires */
const Anthropic = require('@anthropic-ai/sdk');

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
      "role": "Their specific role in this document",
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
      "keyPoints": ["Concise key takeaway", "Another key takeaway"]
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
    "Plain-language description of each restriction, prohibition, exclusion, or limitation"
  ],

  "definitions": [
    { "term": "Defined term", "definition": "Its definition as stated in the document" }
  ],

  "flags": [
    "Any item that stands out — unusual clauses, missing information, contradictions, expiration concerns, notable risks, historical significance, or anything a careful reader should pay attention to"
  ],

  "tags": ["keyword1", "keyword2", "relevant topic tags"],

  "customFields": {
    "note": "Use this for data important to this document type but not covered above (e.g. policyNumber, caseNumber, diagnoses, methodology, etc.)"
  }
}

Document filename: ${fileName}`;

    const lowerName = fileName.toLowerCase();
    const isPDF = lowerName.endsWith('.pdf') || fileType === 'application/pdf';
    const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.xlsm') ||
      (fileType && (fileType.includes('spreadsheet') || fileType.includes('excel')));

    let messageContent;

    if (isPDF) {
      // Pass PDF directly to Claude — no extraction needed, handles image-only PDFs too
      messageContent = [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: fileContent,
          },
        },
        {
          type: 'text',
          text: USER_PROMPT,
        },
      ];
    } else {
      // Extract text from Excel, CSV, TXT, JSON, etc.
      const buffer = Buffer.from(fileContent, 'base64');
      let textContent = '';

      if (isExcel) {
        textContent = extractExcel(buffer);
      } else {
        textContent = buffer.toString('utf-8');
      }

      if (!textContent || textContent.trim().length === 0) {
        return {
          statusCode: 422,
          headers,
          body: JSON.stringify({ error: 'Could not extract any text from this file. It may be empty or in an unsupported format.' }),
        };
      }

      messageContent = [
        {
          type: 'text',
          text: `${USER_PROMPT}\n\nDocument content:\n${textContent.substring(0, 60000)}`,
        },
      ];
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: messageContent }],
    });

    const rawResponse = message.content[0].text.trim();

    let parsedData;
    try {
      const firstBrace = rawResponse.indexOf('{');
      const lastBrace  = rawResponse.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        throw new Error('No JSON object found in response');
      }
      parsedData = JSON.parse(rawResponse.substring(firstBrace, lastBrace + 1));
    } catch (parseErr) {
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
          method: isPDF ? 'native-pdf' : 'text-extraction',
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
