import * as SQLite from 'expo-sqlite';
import { Shift, ShiftDbRow } from '../types';

export async function fetchAllShifts(): Promise<ShiftDbRow[]> {
    const db = await SQLite.openDatabaseAsync('workbuddy.db');
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      hours REAL NOT NULL
    );
  `);
    return await db.getAllAsync<ShiftDbRow>('SELECT * FROM shifts ORDER BY date ASC;');
}

export async function replaceAllShifts(shifts: Shift[]): Promise<void> {
    const db = await SQLite.openDatabaseAsync('workbuddy.db');
    await db.withTransactionAsync(async () => {
        await db.execAsync('DELETE FROM shifts;');
        for (const shift of shifts) {
            await db.runAsync(
                'INSERT INTO shifts (date, start_time, end_time, hours) VALUES (?, ?, ?, ?);',
                [shift.date, shift.startTime, shift.endTime, shift.hours]
            );
        }
    });
}