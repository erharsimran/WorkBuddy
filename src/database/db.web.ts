import { Shift, ShiftDbRow, WeeklySummary } from '../types';
import { getCurrentUser, getUserHourlyRate } from '../services/auth';

const TAX_RATE = Number(process.env.EXPO_PUBLIC_TAX_RATE) || 0.0924;
const CPP_RATE = Number(process.env.EXPO_PUBLIC_CPP_RATE) || 0.0533;
const EI_RATE = Number(process.env.EXPO_PUBLIC_EI_RATE) || 0.0163;

function getShiftsStorageKey(user: string): string {
    return `WORKBUDDY_SHIFTS_${user.toLowerCase()}`;
}

function getWeeklyStorageKey(user: string): string {
    return `WORKBUDDY_WEEKLY_HOURS_${user.toLowerCase()}`;
}

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const formatYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function getWeekDetails(dateStr: string) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const target = new Date(year, month - 1, day);

    const dayOfWeek = target.getDay() === 0 ? 7 : target.getDay();

    const monday = new Date(target);
    monday.setDate(target.getDate() - (dayOfWeek - 1));

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const payDate = new Date(monday);
    payDate.setDate(monday.getDate() + 10);

    const d = new Date(Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

    return {
        weekKey: `${d.getUTCFullYear()}-W${pad(weekNo)}`,
        startDate: formatYMD(monday),
        endDate: formatYMD(sunday),
        payDate: formatYMD(payDate),
    };
}

function calculateWeeklyPay(hours: number, hourlyRate: number) {
    const gross = Number((hours * hourlyRate).toFixed(2));
    const tax = Number((gross * TAX_RATE).toFixed(2));
    const cpp = Number((gross * CPP_RATE).toFixed(2));
    const ei = Number((gross * EI_RATE).toFixed(2));
    const deductions = Number((tax + cpp + ei).toFixed(2));
    const net = Number((gross - deductions).toFixed(2));

    return {
        grossPay: gross,
        estimatedTax: tax,
        estimatedCpp: cpp,
        estimatedEi: ei,
        totalDeductions: deductions,
        estimatedNetPay: net,
    };
}

export function aggregateShiftsByWeek(shifts: ShiftDbRow[], hourlyRate: number): WeeklySummary[] {
    const weekMap: Record<
        string,
        {
            weekKey: string;
            startDate: string;
            endDate: string;
            payDate: string;
            totalHours: number;
            shiftCount: number;
        }
    > = {};

    shifts.forEach((shift) => {
        if (!shift.date) return;
        const { weekKey, startDate, endDate, payDate } = getWeekDetails(shift.date);

        if (!weekMap[weekKey]) {
            weekMap[weekKey] = {
                weekKey,
                startDate,
                endDate,
                payDate,
                totalHours: 0,
                shiftCount: 0,
            };
        }

        weekMap[weekKey].totalHours += Number(shift.hours) || 0;
        weekMap[weekKey].shiftCount += 1;
    });

    return Object.values(weekMap)
        .map((w) => {
            const roundedHours = Number(w.totalHours.toFixed(2));
            const pay = calculateWeeklyPay(roundedHours, hourlyRate);
            return {
                ...w,
                totalHours: roundedHours,
                hourlyRate,
                ...pay,
            };
        })
        .sort((a, b) => b.weekKey.localeCompare(a.weekKey));
}

export async function fetchAllShifts(): Promise<ShiftDbRow[]> {
    try {
        const user = await getCurrentUser();
        if (!user) return [];

        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = window.localStorage.getItem(getShiftsStorageKey(user));
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

        const rate = await getUserHourlyRate(user);

        const formatted: ShiftDbRow[] = shifts.map((s, idx) => ({
            id: idx + 1,
            date: s.date,
            start_time: s.startTime,
            end_time: s.endTime,
            hours: s.hours,
            coworkers: s.coworkers || [],
        }));

        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(getShiftsStorageKey(user), JSON.stringify(formatted));
            const weeklyData = aggregateShiftsByWeek(formatted, rate);
            window.localStorage.setItem(getWeeklyStorageKey(user), JSON.stringify(weeklyData));
        }
    } catch (e) {
        console.error('Failed to save shifts and weekly records:', e);
    }
}

export async function recalculateWeeklyHours(): Promise<WeeklySummary[]> {
    const user = await getCurrentUser();
    if (!user) return [];

    const rate = await getUserHourlyRate(user);
    const shifts = await fetchAllShifts();
    const recalculated = aggregateShiftsByWeek(shifts, rate);

    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(getWeeklyStorageKey(user), JSON.stringify(recalculated));
    }
    return recalculated;
}

export async function fetchWeeklyHours(): Promise<WeeklySummary[]> {
    try {
        const user = await getCurrentUser();
        if (!user) return [];

        const rate = await getUserHourlyRate(user);

        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = window.localStorage.getItem(getWeeklyStorageKey(user));
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                }
            }

            // Auto backfill if missing
            const shifts = await fetchAllShifts();
            if (shifts.length > 0) {
                const backfilled = aggregateShiftsByWeek(shifts, rate);
                window.localStorage.setItem(getWeeklyStorageKey(user), JSON.stringify(backfilled));
                return backfilled;
            }
        }
        return [];
    } catch (e) {
        console.error('Failed to fetch weekly records from localStorage:', e);
        return [];
    }
}
export async function updateSingleShift(updatedShift: ShiftDbRow): Promise<void> {
    const user = await getCurrentUser();
    if (!user) return;

    const currentShifts = await fetchAllShifts();
    const index = currentShifts.findIndex((s) => s.id === updatedShift.id || (s.date === updatedShift.date && s.start_time === updatedShift.start_time));

    if (index !== -1) {
        currentShifts[index] = updatedShift;
    } else {
        currentShifts.push(updatedShift);
    }

    // Format and save shifts + recalculate weekly analysis table
    const rate = await getUserHourlyRate(user);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(getShiftsStorageKey(user), JSON.stringify(currentShifts));
      const weeklyData = aggregateShiftsByWeek(currentShifts, rate);
      window.localStorage.setItem(getWeeklyStorageKey(user), JSON.stringify(weeklyData));
  }
}