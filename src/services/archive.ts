import { supabase } from './supabase';

export interface ArchiveResult {
    success: boolean;
    message: string;
    archivedCount?: number;
    purgedShiftsCount?: number;
}

/**
 * Aggregates shifts older than the current active week, writes summary
 * rows into `weekly_hours_archive`, and deletes the old raw shift rows.
 */
export async function archiveAndPurgeOldShifts(): Promise<ArchiveResult> {
    try {
        // 1. Calculate cutoff date (shifts older than 6 days ago)
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 6);
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

        // 2. Fetch all raw shifts before the cutoff
        const { data: oldShifts, error: fetchErr } = await supabase
            .from('shifts')
            .select('id, employee_id, shift_date, hours, week_label')
            .lt('shift_date', cutoffDateStr)
            .not('employee_id', 'is', null);

        if (fetchErr) {
            return { success: false, message: `Fetch error: ${fetchErr.message}` };
        }

        if (!oldShifts || oldShifts.length === 0) {
            return {
                success: true,
                message: 'No previous week shifts found to archive.',
                archivedCount: 0,
                purgedShiftsCount: 0,
            };
        }

        // 3. Group and aggregate hours per employee per week in JavaScript
        const grouped: Record<string, {
            emp_id: number;
            dates: string[];
            totalHours: number;
            week: string;
        }> = {};

        for (const shift of oldShifts) {
            const key = `${shift.employee_id}_${shift.week_label || 'unknown'}`;
            if (!grouped[key]) {
                grouped[key] = {
                    emp_id: shift.employee_id,
                    dates: [],
                    totalHours: 0,
                    week: shift.week_label || 'N/A',
                };
            }
            grouped[key].dates.push(shift.shift_date);
            grouped[key].totalHours += Number(shift.hours) || 0;
        }

        // 4. Build archive records with month name and date bounds
        const archiveRows = Object.values(grouped).map((item) => {
            item.dates.sort();
            const from_date = item.dates[0];
            const end_date = item.dates[item.dates.length - 1];

            const dateObj = new Date(from_date);
            const month = dateObj.toLocaleString('default', { month: 'long' });

            return {
                emp_id: item.emp_id,
                from_date,
                end_date,
                month,
                week: item.week,
                hours: Number(item.totalHours.toFixed(2)),
            };
        });

        // 5. Upsert aggregated hours into weekly_hours_archive
        const { error: insertErr } = await supabase
            .from('weekly_hours_archive')
            .upsert(archiveRows, { onConflict: 'emp_id,from_date,end_date' });

        if (insertErr) {
            return { success: false, message: `Archive insert error: ${insertErr.message}` };
        }

        // 6. Delete the processed raw shifts from the shifts table
        const shiftIdsToDelete = oldShifts.map((s) => s.id);
        const { error: deleteErr } = await supabase
            .from('shifts')
            .delete()
            .in('id', shiftIdsToDelete);

        if (deleteErr) {
            return {
                success: true,
                message: `Hours archived, but raw shift deletion failed: ${deleteErr.message}`,
                archivedCount: archiveRows.length,
            };
        }

        return {
            success: true,
            message: `Archived ${archiveRows.length} member weekly records and purged ${shiftIdsToDelete.length} raw shifts.`,
            archivedCount: archiveRows.length,
            purgedShiftsCount: shiftIdsToDelete.length,
        };
    } catch (err: any) {
        return { success: false, message: err.message || 'Unexpected archiving error' };
    }
}