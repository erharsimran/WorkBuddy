import { GoogleGenAI } from '@google/genai';
import { Shift } from '../types';

const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || '' });

export async function parseScheduleFromImage(
    base64Image: string,
    employeeName: string = "Harry"
): Promise<Shift[]> {
    if (!apiKey) {
        throw new Error("Missing EXPO_PUBLIC_GEMINI_API_KEY in .env file.");
    }

    const prompt = `Analyze this weekly roster image for employee "${employeeName}".
1. Extract every shift where "${employeeName}" is scheduled (exclude OFF days).
2. For each shift, find all coworkers who work "${employeeName}"'s ENTIRE shift (meaning their scheduled startTime <= "${employeeName}"'s startTime AND their endTime >= "${employeeName}"'s endTime).
3. Exclude "${employeeName}" from the coworkers list.

Return ONLY a valid JSON array matching this format:
[
  {
    "date": "YYYY-MM-DD",
    "startTime": "HH:mm",
    "endTime": "HH:mm",
    "hours": 6.0,
    "coworkers": ["Name1", "Name2"]
  }
]
Ensure 24-hour time formatting (e.g. "15:00" instead of "3:00 PM"). Do not include markdown code block ticks.`;

    const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [
            {
                role: 'user',
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
                ]
            }
        ]
    });

    const rawText = response.text ?? '[]';
    const cleanedJson = rawText.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanedJson) as Shift[];
}