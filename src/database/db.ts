import * as SQLite from 'expo-sqlite';
import { Shift, ShiftDbRow, WeeklySummary } from '../types';
import { getCurrentUser, getUserHourlyRate } from '../services/auth';

const TAX_RATE = Number(process.env.EXPO_PUBLIC_TAX_RATE) || 0.0924;
const CPP_RATE = Number(process.env.EXPO_PUBLIC_CPP_RATE) || 0.0533;
const EI_RATE = Number(process.env.EXPO_PUBLIC_EI_RATE) || 0.0163;

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

function aggregateShiftsByWeek(shifts: ShiftDbRow[], hourlyRate: number): WeeklySummary[] {
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

async function getDatabase() {
    const db = await SQLite.openDatabaseAsync('workbuddy.db');
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      hours REAL NOT NULL,
      coworkers TEXT
    );
    CREATE TABLE IF NOT EXISTS weekly_hours (
      weekKey TEXT PRIMARY KEY,
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      payDate TEXT NOT NULL,
      totalHours REAL NOT NULL,
      shiftCount INTEGER NOT NULL,
      hourlyRate REAL NOT NULL,
      grossPay REAL NOT NULL,
      estimatedTax REAL NOT NULL,
      estimatedCpp REAL NOT NULL,
      estimatedEi REAL NOT NULL,
      totalDeductions REAL NOT NULL,
      estimatedNetPay REAL NOT NULL
    );
  `);
    return db;
}

export async function fetchAllShifts(): Promise<ShiftDbRow[]> {
    try {
        const db = await getDatabase();
        const rows = await db.getAllAsync<{
            id: number;
            date: string;
            start_time: string;
            end_time: string;
            hours: number;
            coworkers: string | null;
        }>('SELECT * FROM shifts ORDER BY date ASC;');

        return rows.map((r) => ({
            ...r,
            coworkers: r.coworkers ? JSON.parse(r.coworkers) : [],
        }));
    } catch (e) {
        console.error('Failed to fetch shifts from SQLite:', e);
        return [];
    }
}

export async function replaceAllShifts(shifts: Shift[]): Promise<void> {
    const db = await getDatabase();
    const user = (await getCurrentUser()) || 'user';
    const rate = await getUserHourlyRate(user);

    const formatted: ShiftDbRow[] = shifts.map((s, idx) => ({
        id: idx + 1,
        date: s.date,
        start_time: s.startTime,
        end_time: s.endTime,
        hours: s.hours,
        coworkers: s.coworkers || [],
    }));

    const weeklySummaries = aggregateShiftsByWeek(formatted, rate);

    await db.withTransactionAsync(async () => {
        await db.execAsync('DELETE FROM shifts;');
        for (const shift of shifts) {
            await db.runAsync(
                'INSERT INTO shifts (date, start_time, end_time, hours, coworkers) VALUES (?, ?, ?, ?, ?);',
                [
                    shift.date,
                    shift.startTime,
                    shift.endTime,
                    shift.hours,
                    JSON.stringify(shift.coworkers || []),
                ]
            );
        }

        await db.execAsync('DELETE FROM weekly_hours;');
        for (const w of weeklySummaries) {
            await db.runAsync(
        `INSERT INTO weekly_hours (
          weekKey, startDate, endDate, payDate, totalHours, shiftCount,
          hourlyRate, grossPay, estimatedTax, estimatedCpp, estimatedEi,
          totalDeductions, estimatedNetPay
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                [
                    w.weekKey,
                    w.startDate,
                    w.endDate,
                    w.payDate,
                    w.totalHours,
                    w.shiftCount,
                    w.hourlyRate,
                    w.grossPay,
                    w.estimatedTax,
                    w.estimatedCpp,
                    w.estimatedEi,
                    w.totalDeductions,
                    w.estimatedNetPay,
                ]
            );
        }
    });
}

export async function fetchWeeklyHours(): Promise<WeeklySummary[]> {
    try {
        const db = await getDatabase();
        return await db.getAllAsync<WeeklySummary>(
            'SELECT * FROM weekly_hours ORDER BY weekKey DESC;'
        );
    } catch (e) {
        console.error('Failed to fetch weekly records from SQLite:', e);
        return [];
    }
}

export async function saveWeeklyHours(weeklyRecords: WeeklySummary[]): Promise<void> {
    try {
        const db = await getDatabase();
        await db.withTransactionAsync(async () => {
            await db.execAsync('DELETE FROM weekly_hours;');
            for (const w of weeklyRecords) {
                await db.runAsync(
          `INSERT INTO weekly_hours (
            weekKey, startDate, endDate, payDate, totalHours, shiftCount,
            hourlyRate, grossPay, estimatedTax, estimatedCpp, estimatedEi,
            totalDeductions, estimatedNetPay
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                    [
                        w.weekKey,
                        w.startDate,
                        w.endDate,
                        w.payDate,
                        w.totalHours,
                        w.shiftCount,
                        w.hourlyRate,
                        w.grossPay,
                        w.estimatedTax,
                        w.estimatedCpp,
                        w.estimatedEi,
                        w.totalDeductions,
                        w.estimatedNetPay,
                    ]
                );
            }
    });
    } catch (e) {
        console.error('Failed to update weekly records in SQLite:', e);
    }
}

export async function recalculateWeeklyHours(): Promise<WeeklySummary[]> {
    const user = (await getCurrentUser()) || 'user';
    const rate = await getUserHourlyRate(user);
    const shifts = await fetchAllShifts();
    const recalculated = aggregateShiftsByWeek(shifts, rate);
    await saveWeeklyHours(recalculated);
    return recalculated;
}

export async function updateSingleShift(updatedShift: ShiftDbRow): Promise<void> {
    const db = await getDatabase();
    const user = (await getCurrentUser()) || 'user';
    const rate = await getUserHourlyRate(user);

    await db.runAsync(
        'UPDATE shifts SET date = ?, start_time = ?, end_time = ?, hours = ?, coworkers = ? WHERE id = ?;',
        [
            updatedShift.date,
            updatedShift.start_time,
            updatedShift.end_time,
            updatedShift.hours,
            JSON.stringify(updatedShift.coworkers || []),
            updatedShift.id,
        ]
    );

    const refreshedShifts = await fetchAllShifts();
    const weeklySummaries = aggregateShiftsByWeek(refreshedShifts, rate);

    await db.withTransactionAsync(async () => {
        await db.execAsync('DELETE FROM weekly_hours;');
        for (const w of weeklySummaries) {
            await db.runAsync(
                `INSERT INTO weekly_hours (
          weekKey, startDate, endDate, payDate, totalHours, shiftCount,
          hourlyRate, grossPay, estimatedTax, estimatedCpp, estimatedEi,
          totalDeductions, estimatedNetPay
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                [
                    w.weekKey,
                    w.startDate,
                    w.endDate,
                    w.payDate,
                    w.totalHours,
                    w.shiftCount,
                    w.hourlyRate,
                    w.grossPay,
                    w.estimatedTax,
                    w.estimatedCpp,
                    w.estimatedEi,
                    w.totalDeductions,
                    w.estimatedNetPay,
                ]
            );
        }
    });
}