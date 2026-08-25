import { GoogleGenAI, Type } from '@google/genai';
import { Shift } from '../types';

const ai = new GoogleGenAI({
    apiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY || '',
});

export async function parseScheduleFromImage(
    imageBase64: string,
    targetEmployeeName: string
): Promise<Shift[]> {
    const prompt = `
    Analyze this work roster image.
    Find all scheduled shifts for the employee named "${targetEmployeeName}".
    
    For each shift of "${targetEmployeeName}":
    1. Extract the shift date in "YYYY-MM-DD" format.
    2. Extract start_time and end_time in 24-hour "HH:mm" format (e.g., "12:00", "21:30").
    3. Calculate or extract total hours worked as a decimal number.
    4. List ALL coworkers scheduled on that SAME date. For each coworker, include their name and their exact scheduled shift startTime and endTime (e.g. name: "Neeru D.", startTime: "12:00", endTime: "21:30"). Exclude "${targetEmployeeName}".
  `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
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
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        date: { type: Type.STRING, description: 'YYYY-MM-DD' },
                        startTime: { type: Type.STRING, description: 'HH:mm (24hr)' },
                        endTime: { type: Type.STRING, description: 'HH:mm (24hr)' },
                        hours: { type: Type.NUMBER, description: 'Total shift hours' },
                        coworkers: {
                            type: Type.ARRAY,
                            description: 'All coworkers working on the same date with their timings',
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING },
                                    startTime: { type: Type.STRING, description: 'HH:mm' },
                                    endTime: { type: Type.STRING, description: 'HH:mm' },
                                },
                                required: ['name', 'startTime', 'endTime'],
                            },
                        },
                    },
                    required: ['date', 'startTime', 'endTime', 'hours'],
                },
            },
        },
    });

    if (!response.text) {
        throw new Error('No schedule data found from the model.');
    }

    const parsed = JSON.parse(response.text);
    return parsed as Shift[];
}