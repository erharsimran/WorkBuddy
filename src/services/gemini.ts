import { Shift } from '../types';

export async function parseScheduleFromImage(
    imageBase64: string,
    targetEmployeeName: string
): Promise<Shift[]> {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error('Missing Gemini API Key. Check EXPO_PUBLIC_GEMINI_API_KEY in .env.');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

    const prompt = `
    Analyze this work roster image.
    Find all scheduled shifts for the employee named "${targetEmployeeName}".
    
    For each shift of "${targetEmployeeName}":
    1. Extract the shift date in "YYYY-MM-DD" format.
    2. Extract start_time and end_time in 24-hour "HH:mm" format (e.g. "12:00", "21:30").
    3. Calculate total hours worked as a decimal number.
    4. List ALL coworkers scheduled on that SAME date. For each coworker, include their name and their exact scheduled shift startTime and endTime (e.g., {"name": "Neeru D.", "startTime": "12:00", "endTime": "21:30"}). Exclude "${targetEmployeeName}".

    Respond ONLY with a valid JSON array matching this structure:
    [
      {
        "date": "YYYY-MM-DD",
        "startTime": "HH:mm",
        "endTime": "HH:mm",
        "hours": 7.5,
        "coworkers": [
          { "name": "Name", "startTime": "HH:mm", "endTime": "HH:mm" }
        ]
      }
    ]
  `;

    const body = {
        contents: [
            {
                role: 'user',
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: 'image/jpeg',
                            data: imageBase64,
                        },
                    },
                ],
            },
        ],
        generationConfig: {
            responseMimeType: 'application/json',
        },
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
  });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error?.message || `Request failed with status ${response.status}`;
        throw new Error(`Gemini API Error: ${message}`);
    }

    const result = await response.json();
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
        throw new Error('No roster data found in image.');
    }

    return JSON.parse(rawText) as Shift[];
}