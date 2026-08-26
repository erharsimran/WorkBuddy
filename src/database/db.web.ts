import { Shift, ShiftDbRow, WeeklySummary } from '../types';
import { getCurrentUser, getUserHourlyRate } from '../services/auth';
import { supabase } from '../services/supabase';

const TAX_RATE = Number(process.env.EXPO_PUBLIC_TAX_RATE) || 0.0924;
const CPP_RATE = Number(process.env.EXPO_PUBLIC_CPP_RATE) || 0.0533;
const EI_RATE = Number(process.env.EXPO_PUBLIC_EI_RATE) || 0.0163;

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const formatYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function getWeekDetails(dateStr: string) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const target = new Date(year, month - 1, day);

    const dayOfWeek = target.getDay() === 0 ? 7 : target.getDay();

    // Monday of shift week
    const monday = new Date(target);
    monday.setDate(target.getDate() - (dayOfWeek - 1));

    // Sunday of shift week
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    // Thursday pay deposit date (following week)
    const payDate = new Date(monday);
    payDate.setDate(monday.getDate() + 10);

    // ISO Week numbering
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

// 1. Fetch All Shifts From Supabase Cloud DB
export async function fetchAllShifts(): Promise<ShiftDbRow[]> {
    try {
        const user = await getCurrentUser();
        if (!user) return [];

      const { data, error } = await supabase
          .from('user_shifts')
          .select('*')
          .eq('username', user.toLowerCase())
          .order('date', { ascending: true });

      if (error) {
          console.error('Supabase fetch error:', error);
          return [];
      }

      return (data || []).map((row) => ({
          id: row.id,
          date: row.date,
          start_time: row.start_time,
          end_time: row.end_time,
          hours: Number(row.hours),
          coworkers: row.coworkers || [],
      }));
  } catch (e) {
      console.error('Failed to fetch shifts from cloud:', e);
      return [];
  }
}

// 2. Insert or Merge New Scanned Shifts (Deduplicating by Date)
export async function replaceAllShifts(newShifts: Shift[]): Promise<void> {
    try {
        const user = await getCurrentUser();
        if (!user) return;

      const rowsToUpsert = newShifts.map((s) => ({
          username: user.toLowerCase(),
          date: s.date,
          start_time: s.startTime,
          end_time: s.endTime,
          hours: s.hours,
          coworkers: s.coworkers || [],
      }));

      const { error } = await supabase
          .from('user_shifts')
          .upsert(rowsToUpsert, { onConflict: 'username,date' });

      if (error) {
          console.error('Supabase upsert error:', error);
          throw new Error(error.message);
      }
  } catch (e) {
      console.error('Failed to save/merge shifts to cloud:', e);
  }
}

// 3. Update single shift timing
export async function updateSingleShift(updatedShift: ShiftDbRow): Promise<void> {
    const user = await getCurrentUser();
    if (!user) return;

    const { error } = await supabase
        .from('user_shifts')
        .update({
            start_time: updatedShift.start_time,
            end_time: updatedShift.end_time,
            hours: updatedShift.hours,
            coworkers: updatedShift.coworkers || [],
        })
        .eq('id', updatedShift.id);

    if (error) {
        console.error('Failed to update shift in cloud:', error);
        throw new Error(error.message);
    }
}

// 4. Fetch Weekly Summaries
export async function fetchWeeklyHours(): Promise<WeeklySummary[]> {
    const user = await getCurrentUser();
    if (!user) return [];

    const rate = await getUserHourlyRate(user);
    const allShifts = await fetchAllShifts();
    return aggregateShiftsByWeek(allShifts, rate);
}

export async function recalculateWeeklyHours(): Promise<WeeklySummary[]> {
    return await fetchWeeklyHours();
}