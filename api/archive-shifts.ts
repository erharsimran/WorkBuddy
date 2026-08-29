import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lhfwqxqujlagaudbrctg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_jwmblHXTHZXoljX0OslnbQ_dmfpodVc';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getWeekNumber(d: Date): number {
    const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // 1. Calculate cutoff in America/Toronto timezone (shifts older than 6 days from today)
        const now = new Date();
        const estDateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });

        const cutoffDate = new Date(`${estDateStr}T00:00:00`);
        cutoffDate.setDate(cutoffDate.getDate() - 6);
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

        // 2. Fetch all raw shifts before cutoff (without requesting week_label)
        const { data: oldShifts, error: fetchErr } = await supabase
            .from('store_shifts')
            .select('id, employee_id, date, hours')
            .lt('date', cutoffDateStr)
            .not('employee_id', 'is', null);

        if (fetchErr) {
            return res.status(500).json({
                success: false,
                error: `Error querying shifts: ${fetchErr.message}`,
            });
        }

        if (!oldShifts || oldShifts.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No previous week shifts found to archive.',
                cutoffDate: cutoffDateStr,
                archivedCount: 0,
                purgedShiftsCount: 0,
            });
        }

        // 3. Group and aggregate hours per employee by calendar week
        const grouped: Record<
            string,
            {
                emp_id: number;
                dates: string[];
                totalHours: number;
                weekNumber: number;
            }
        > = {};

        for (const shift of oldShifts) {
            const shiftDate = new Date(`${shift.date}T00:00:00`);
            const weekNumber = getWeekNumber(shiftDate);
            const key = `${shift.employee_id}_w${weekNumber}`;

            if (!grouped[key]) {
                grouped[key] = {
                    emp_id: Number(shift.employee_id),
                    dates: [],
                    totalHours: 0,
                    weekNumber,
                };
            }
            grouped[key].dates.push(shift.date);
            grouped[key].totalHours += Number(shift.hours) || 0;
        }

        // 4. Format rows for weekly_hours_archive table
        const archiveRows = Object.values(grouped).map((item) => {
            item.dates.sort();
            const from_date = item.dates[0];
            const end_date = item.dates[item.dates.length - 1];

            const dateObj = new Date(`${from_date}T00:00:00`);
            const month = dateObj.toLocaleString('en-US', {
                month: 'long',
                timeZone: 'America/Toronto',
            });

            return {
                emp_id: item.emp_id,
                from_date,
                end_date,
                month,
                week: `Week ${item.weekNumber}`,
                hours: Number(item.totalHours.toFixed(2)),
            };
        });

        // 5. Upsert aggregated rows
        const { error: insertErr } = await supabase
            .from('weekly_hours_archive')
            .upsert(archiveRows, { onConflict: 'emp_id,from_date,end_date' });

        if (insertErr) {
            return res.status(500).json({
                success: false,
                error: `Failed to insert archive rows: ${insertErr.message}`,
            });
        }

        // 6. Delete processed raw shifts
        const shiftIdsToDelete = oldShifts.map((s) => s.id);
        const { error: deleteErr } = await supabase
            .from('store_shifts')
            .delete()
            .in('id', shiftIdsToDelete);

        if (deleteErr) {
            return res.status(200).json({
                success: true,
                message: `Hours archived, but raw shift deletion failed: ${deleteErr.message}`,
                archivedCount: archiveRows.length,
                purgedShiftsCount: 0,
            });
        }

        return res.status(200).json({
            success: true,
            message: `Successfully archived ${archiveRows.length} member weekly records and deleted ${shiftIdsToDelete.length} raw shifts.`,
            cutoffDate: cutoffDateStr,
            archivedCount: archiveRows.length,
            purgedShiftsCount: shiftIdsToDelete.length,
            archiveRows,
        });
    } catch (err: any) {
        return res.status(500).json({
            success: false,
            error: err.message || 'Internal Server Error',
        });
    }
}