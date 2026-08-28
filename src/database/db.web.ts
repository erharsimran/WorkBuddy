import { ShiftDbRow, WeeklySummary } from '../types';
import { getCurrentUser, getUserHourlyRate } from '../services/auth';
import { supabase } from '../services/supabase';
import { RawRosterMatrix } from '../services/gemini';

const TAX_RATE = Number(process.env.EXPO_PUBLIC_TAX_RATE) || 0.0924;
const CPP_RATE = Number(process.env.EXPO_PUBLIC_CPP_RATE) || 0.0533;
const EI_RATE = Number(process.env.EXPO_PUBLIC_EI_RATE) || 0.0163;

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const formatYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function convertTo24Hour(timeStr: string): string {
    if (!timeStr) return '';
    const clean = timeStr.trim().toLowerCase();
    const match = clean.match(/(\d{1,2}):(\d{2})\s*([ap]m?)?/);
    if (!match) return clean;

    let h = parseInt(match[1], 10);
    const m = match[2];
    const meridian = match[3];

    if (meridian?.startsWith('p') && h < 12) h += 12;
    if (meridian?.startsWith('a') && h === 12) h = 0;

    return `${pad(h)}:${m}`;
}

function computeShiftHours(startTime: string, endTime: string): number {
    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);
    let startMin = sH * 60 + sM;
    let endMin = eH * 60 + eM;

    if (endMin < startMin) endMin += 24 * 60;
    const grossHours = (endMin - startMin) / 60;
    const netHours = grossHours > 5.5 ? grossHours - 0.5 : grossHours;
    return Number(netHours.toFixed(2));
}

function getShiftTypeTag(startTime: string, endTime: string): string {
    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);
    const startMin = sH * 60 + sM;
    const endMin = eH * 60 + eM;

    if (startMin >= 330 && startMin <= 420) return 'open';
    if (endMin >= 1230 || (endMin < startMin && endMin <= 180)) return 'close';
    if (startMin < 600 && endMin >= 1020 && endMin <= 1200) return 'mid';
    return 'regular';
}

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

// 1. Save entire store roster to relational tables
export async function saveFullStoreRoster(matrix: RawRosterMatrix): Promise<void> {
    const [startY, startM, startD] = matrix.week.split('-').map(Number);
    const weekStartDate = new Date(Date.UTC(startY, startM - 1, startD));

    await supabase.from('store_schedules').upsert(
        { store_number: matrix.store || '0305', week_start_date: matrix.week },
        { onConflict: 'store_number,week_start_date' }
    );

    const employeesToUpsert: any[] = [];
    const shiftRows: any[] = [];

    for (const row of matrix.rows) {
        const [role, name, ...days] = row;
        if (!name || !name.trim()) continue;

        const cleanName = name.trim();
        employeesToUpsert.push({
            full_name: cleanName,
            display_name: cleanName,
            role_category: role || 'Staff',
        });

        days.forEach((cellText, dayIndex) => {
            if (!cellText || !cellText.trim()) return;

            const currentDay = new Date(weekStartDate);
            currentDay.setUTCDate(weekStartDate.getUTCDate() + dayIndex);
            const dateStr = `${currentDay.getUTCFullYear()}-${pad(currentDay.getUTCMonth() + 1)}-${pad(currentDay.getUTCDate())}`;

            const cell = cellText.trim();
            const isVacation = /vacation/i.test(cell);

            let startTime = '00:00';
            let endTime = '00:00';
            let hours = 0;

            if (!isVacation && cell.includes('-')) {
                const [rawStart, rawEnd] = cell.split('-');
                startTime = convertTo24Hour(rawStart);
                endTime = convertTo24Hour(rawEnd);
                hours = computeShiftHours(startTime, endTime);
      }

            shiftRows.push({
                employee_name: cleanName,
                date: dateStr,
                start_time: startTime,
                end_time: endTime,
                hours,
                is_vacation: isVacation,
                shift_type: isVacation ? 'other' : getShiftTypeTag(startTime, endTime),
            });
        });
    }

    await supabase.from('employees').upsert(employeesToUpsert, { onConflict: 'display_name' });

    const { error } = await supabase
        .from('store_shifts')
        .upsert(shiftRows, { onConflict: 'employee_name,date' });

    if (error) {
        console.error('Database Sync Error:', error);
        throw new Error(error.message);
    }
}

// 2. Fetch logged-in user shifts + attach dynamic coworkers
export async function fetchAllShifts(): Promise<ShiftDbRow[]> {
    try {
        const user = await getCurrentUser();
        if (!user) return [];

        const { data: userShifts, error } = await supabase
            .from('store_shifts')
          .select('*')
          .ilike('employee_name', `${user.trim()}%`)
          .order('date', { ascending: true });

        if (error || !userShifts) {
            console.error('Shift fetch error:', error);
          return [];
      }

        const shiftDates = [...new Set(userShifts.map((s) => s.date))];
        const { data: allStoreShifts } = await supabase
            .from('store_shifts')
            .select('*')
            .in('date', shiftDates);

        return userShifts.map((row) => {
            const coworkers = (allStoreShifts || [])
                .filter(
                    (s) =>
                        s.date === row.date &&
                        s.employee_name.toLowerCase() !== row.employee_name.toLowerCase()
                )
                .map((s) => ({
                    name: s.employee_name,
                    startTime: s.start_time,
                    endTime: s.end_time,
                }));

            return {
                id: row.id,
                date: row.date,
                start_time: row.start_time,
                end_time: row.end_time,
                hours: Number(row.hours),
              coworkers,
          };
      });
  } catch (e) {
        console.error('Error in fetchAllShifts:', e);
      return [];
  }
}

// 3. Update single shift
export async function updateSingleShift(updatedShift: ShiftDbRow): Promise<void> {
    const { error } = await supabase
        .from('store_shifts')
        .update({
            start_time: updatedShift.start_time,
            end_time: updatedShift.end_time,
            hours: updatedShift.hours,
          shift_type: getShiftTypeTag(updatedShift.start_time, updatedShift.end_time),
      })
        .eq('id', updatedShift.id);

    if (error) {
        console.error('Failed to update shift:', error);
        throw new Error(error.message);
    }
}

// 4. Fetch weekly summaries
export async function fetchWeeklyHours(): Promise<WeeklySummary[]> {
    const user = await getCurrentUser();
    if (!user) return [];

    const rate = await getUserHourlyRate(user);
    const allShifts = await fetchAllShifts();

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

    allShifts.forEach((shift) => {
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
            const pay = calculateWeeklyPay(roundedHours, rate);
            return { ...w, totalHours: roundedHours, hourlyRate: rate, ...pay };
        })
        .sort((a, b) => b.weekKey.localeCompare(a.weekKey));
}

// 5. Recalculate weekly hours
export async function recalculateWeeklyHours(): Promise<WeeklySummary[]> {
    return await fetchWeeklyHours();
}


// Fetch all registered store employees
export async function fetchStoreEmployees() {
    const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('role_category', { ascending: true })
        .order('display_name', { ascending: true });

    if (error) {
        console.error('Fetch employees error:', error);
        return [];
    }
    return data || [];
}

// Update employee name and role
export async function updateStoreEmployee(
    id: number,
    oldDisplayName: string,
    newDisplayName: string,
    newRole: string
) {
    // Update employee record
    const { error: empErr } = await supabase
        .from('employees')
        .update({ display_name: newDisplayName.trim(), role_category: newRole.trim() })
        .eq('id', id);

    if (empErr) throw new Error(empErr.message);

    // Propagate name change to shifts table
    if (oldDisplayName.trim() !== newDisplayName.trim()) {
        await supabase
            .from('store_shifts')
            .update({ employee_name: newDisplayName.trim() })
            .eq('employee_name', oldDisplayName.trim());
    }
}