import { supabase } from './supabase';

export interface RawRosterMatrix {
    week: string; // "YYYY-MM-DD"
    store: string;
    rows: [string, string, string, string, string, string, string, string, string][];
    // [Role, Name, Mon, Tue, Wed, Thu, Fri, Sat, Sun]
}

const ROSTER_PROMPT = `
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

type LogFn = (msg: string) => void;

/**
 * Fallback to OpenRouter Free Vision Endpoint
 */
async function parseWithFreeFallback(cleanBase64: string, onLog?: LogFn): Promise<RawRosterMatrix> {
    const openRouterKey = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;
    if (!openRouterKey) {
        throw new Error('Gemini models unavailable and no EXPO_PUBLIC_OPENROUTER_API_KEY configured as fallback.');
    }

    onLog?.('Connecting to secondary fallback agent (OpenRouter Free Vision)...');

    const freeModels = [
        'google/gemma-4-26b-a4b-it:free',
        'thinkingmachines/inkling-small:free',
        'openrouter/free',
    ];

    for (const model of freeModels) {
        try {
            onLog?.(`Trying fallback model: ${model}...`);
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${openRouterKey}`,
                    'HTTP-Referer': 'https://workbuddy.app',
                    'X-Title': 'WorkBuddy',
                },
                body: JSON.stringify({
                    model,
                    temperature: 0.1,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: ROSTER_PROMPT },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:image/jpeg;base64,${cleanBase64}`,
                                    },
                                },
                            ],
                        },
                    ],
                }),
            });

            if (!response.ok) {
                onLog?.(`⚠️ Fallback ${model} returned status ${response.status}`);
                continue;
            }

            const result = await response.json();
            const rawText = result.choices?.[0]?.message?.content;
            if (!rawText) continue;

            const cleaned = rawText.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
            return JSON.parse(cleaned) as RawRosterMatrix;
        } catch (e: any) {
            onLog?.(`⚠️ Error with ${model}: ${e.message}`);
        }
    }

    throw new Error('All primary and secondary OCR agents exhausted. Please try again shortly.');
}

export async function parseFullStoreRoster(
    imageBase64: string,
    onLog?: LogFn
): Promise<RawRosterMatrix> {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    if (apiKey) {
        const models = ['gemini-3.8-flash', 'gemini-3.6-flash'];

    const body = {
        contents: [
            {
                role: 'user',
                parts: [
                    { text: ROSTER_PROMPT },
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

    for (const model of models) {
        onLog?.(`Submitting image to Gemini endpoint: ${model}...`);
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

            if (
                response.status === 503 ||
                response.status === 429 ||
                response.status === 404 ||
                msg.toLowerCase().includes('demand') ||
                msg.toLowerCase().includes('available')
            ) {
                onLog?.(`⚠️ ${model} busy/unavailable (${response.status}). Switching to alternate...`);
                continue;
          }

            throw new Error(`Gemini Error (${response.status}): ${msg}`);
        }

        const result = await response.json();
        const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!rawText) throw new Error('No content returned in response.');

          onLog?.(`✓ Matrix response received successfully from ${model}.`);
        return JSON.parse(rawText) as RawRosterMatrix;
      } catch (err: any) {
          onLog?.(`⚠️ Request error on ${model}: ${err.message}`);
      }
      }
  }

    // Fallback if Gemini failed or key missing
    onLog?.('Gemini unavailable. Switching to secondary fallback agent...');
    return await parseWithFreeFallback(cleanBase64, onLog);
}