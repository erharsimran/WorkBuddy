import { supabase } from './supabase';

export interface RawRosterMatrix {
    week: string; // "YYYY-MM-DD"
    store: string;
    rows: [string, string, string, string, string, string, string, string, string][];
    // [Role, Name, Mon, Tue, Wed, Thu, Fri, Sat, Sun]
}

export async function parseFullStoreRoster(imageBase64: string): Promise<RawRosterMatrix> {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) throw new Error('Missing Gemini API Key.');

    // Clean data URL prefix if present
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const prompt = `
Transcribe this store schedule grid into flat rows.

1. "week": Date from "Week of: [Month Day, Year]" in YYYY-MM-DD.
2. "store": Store number string (e.g. "0305").
3. "rows": Array of rows. Each row is an array of 9 string elements:
   [Role, Employee Name, Mon, Tue, Wed, Thu, Fri, Sat, Sun]
   - Time format: exact raw shift text like "06:00a-04:30p", "02:00p-09:30p", or "Vacation".
   - If empty/off day, use empty string "".

Return ONLY valid JSON matching this exact structure:
{
  "week": "2026-08-31",
  "store": "0305",
  "rows": [
    ["ATL and TL", "Harry H.", "02:00p-09:30p", "02:00p-09:30p", "", "06:00a-12:30p", "06:00a-12:30p", "02:00p-09:30p", ""]
  ]
}
`;

    const body = {
        contents: [
            {
                role: 'user',
                parts: [
                    { text: prompt },
                  { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
              ],
          },
      ],
      generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 4096,
      },
  };

    // Uses gemini-3.8-flash as the active production model
    const models = ['gemini-3.8-flash', 'gemini-3.6-flash'];

    let lastErrorMessage = '';

    for (const model of models) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        try {
        const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

        if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
          const msg = errorData.error?.message || response.statusText;

          if (response.status === 503 || response.status === 429 || msg.toLowerCase().includes('demand')) {
              console.warn(`[Gemini] ${model} overloaded. Retrying next available model...`);
              lastErrorMessage = msg;
              continue;
          }

          throw new Error(`Gemini Parsing Error: ${msg}`);
      }

        const result = await response.json();
        const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error('No roster data found.');

        return JSON.parse(rawText) as RawRosterMatrix;
        } catch (err: any) {
            if (err.message && !err.message.includes('overloaded') && !err.message.includes('demand')) {
                throw err;
            }
            lastErrorMessage = err.message;
        }
    }

    throw new Error(`Gemini servers are busy: ${lastErrorMessage}. Please try again in a few moments.`);
}