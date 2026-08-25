import { Shift, ShiftDbRow } from '../types';
import { getCurrentUser } from '../services/auth';

function getStorageKey(user: string): string {
    return `WORKBUDDY_SHIFTS_${user.toLowerCase()}`;
}

export async function fetchAllShifts(): Promise<ShiftDbRow[]> {
    try {
        const user = await getCurrentUser();
        if (!user) return [];

        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = window.localStorage.getItem(getStorageKey(user));
            return raw ? JSON.parse(raw) : [];
        }
        return [];
    } catch (e) {
        console.error('Failed to fetch shifts from localStorage:', e);
        return [];
    }
}

export async function replaceAllShifts(shifts: Shift[]): Promise<void> {
    try {
        const user = await getCurrentUser();
        if (!user) return;

        const formatted: ShiftDbRow[] = shifts.map((s, idx) => ({
            id: idx + 1,
            date: s.date,
            start_time: s.startTime,
            end_time: s.endTime,
            hours: s.hours,
            coworkers: s.coworkers || [],
        }));

        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(getStorageKey(user), JSON.stringify(formatted));
        }
    } catch (e) {
        console.error('Failed to save shifts to localStorage:', e);
    }
}