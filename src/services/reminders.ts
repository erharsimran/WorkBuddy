import { ShiftDbRow } from '../types';

export function syncToAppleReminders(shifts: ShiftDbRow[]) {
    if (!shifts || shifts.length === 0) return;

    // Format: Title | YYYY-MM-DD HH:mm | Notes
    const lines = shifts.map((shift) => {
        const coworkerInfo = shift.coworkers?.length
            ? `Coworkers: ${shift.coworkers.join(', ')}`
            : 'No coworkers';

        const title = `Work Shift (${shift.start_time} - ${shift.end_time})`;
        const dateTime = `${shift.date} ${shift.start_time}`;

        return `${title} | ${dateTime} | ${coworkerInfo}`;
    });

    const payload = encodeURIComponent(lines.join('\n'));
    const shortcutUrl = `shortcuts://run-shortcut?name=WorkBuddy%20Reminders&input=text&text=${payload}`;

    window.location.href = shortcutUrl;
}