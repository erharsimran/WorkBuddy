import { ShiftDbRow } from '../types';

export function downloadCalendarReminders(shifts: ShiftDbRow[], employeeName: string) {
    if (!shifts || shifts.length === 0) return;

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

    const vEvents = shifts.map((shift, index) => {
        const [year, month, day] = shift.date.split('-').map(Number);
        const [startHour, startMin] = shift.start_time.split(':').map(Number);
        const [endHour, endMin] = shift.end_time.split(':').map(Number);

        const dtStart = `${year}${pad(month)}${pad(day)}T${pad(startHour)}${pad(startMin)}00`;
        const dtEnd = `${year}${pad(month)}${pad(day)}T${pad(endHour)}${pad(endMin)}00`;
        const uid = `shift-${shift.date}-${shift.start_time}-${index}@workbuddy.app`;

        const coworkerSummary = shift.coworkers && shift.coworkers.length > 0
            ? `Coworkers: ${shift.coworkers.join(', ')}`
            : 'No coworkers scheduled';

        // Offset to previous day 10:00 PM
        const shiftStartTime = new Date(year, month - 1, day, startHour, startMin);
        const prevDay10PM = new Date(year, month - 1, day - 1, 22, 0, 0);
        const diffMinutes = Math.round((shiftStartTime.getTime() - prevDay10PM.getTime()) / (1000 * 60));

        const hoursOffset = Math.floor(diffMinutes / 60);
        const minsOffset = diffMinutes % 60;
        const duration10PM = minsOffset > 0 ? `-PT${hoursOffset}H${minsOffset}M` : `-PT${hoursOffset}H`;

        return [
            'BEGIN:VEVENT',
            `UID:${uid}`,
            `SUMMARY:Work Shift (${shift.hours} hrs)`,
            `DESCRIPTION:${coworkerSummary}`,
            `DTSTART:${dtStart}`,
            `DTEND:${dtEnd}`,
            'BEGIN:VALARM',
            `TRIGGER:${duration10PM}`,
            'ACTION:DISPLAY',
            'DESCRIPTION:Reminder: Work Shift tomorrow',
            'END:VALARM',
            'BEGIN:VALARM',
            'TRIGGER:-PT2H',
            'ACTION:DISPLAY',
            `DESCRIPTION:Reminder: Work Shift in 2 hours (${shift.start_time} - ${shift.end_time})`,
            'END:VALARM',
            'END:VEVENT',
        ].join('\r\n');
    });

    const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//WorkBuddy//Shift Calendar//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        ...vEvents,
        'END:VCALENDAR',
    ].join('\r\n');

    downloadIcs(icsContent, `${employeeName}_Work_Schedule.ics`);
}

// Test function: creates an event 5 mins from now with an alarm in 3 mins (-PT2M before event)
export function downloadTestCalendarAlert(employeeName: string) {
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const now = new Date();

    const start = new Date(now.getTime() + 5 * 60 * 1000); // 5 mins from now
    const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 min duration

    const formatUtcOrLocal = (d: Date) =>
        `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

    const dtStart = formatUtcOrLocal(start);
    const dtEnd = formatUtcOrLocal(end);
    const uid = `test-alarm-${Date.now()}@workbuddy.app`;

    const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//WorkBuddy//Test Calendar//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        'SUMMARY:🔔 Test WorkBuddy Shift Alarm',
        'DESCRIPTION:Testing alert triggers on Apple Calendar',
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        // Alarm triggers 2 minutes before event start (3 mins from when button was tapped)
        'BEGIN:VALARM',
        'TRIGGER:-PT2M',
        'ACTION:DISPLAY',
        'DESCRIPTION:🔔 Test WorkBuddy Shift Alarm Triggered!',
        'END:VALARM',
        // Alarm triggers right at event start
        'BEGIN:VALARM',
        'TRIGGER:-PT0M',
        'ACTION:DISPLAY',
        'DESCRIPTION:🔔 Shift Starting Now!',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
    ].join('\r\n');

    downloadIcs(icsContent, `Test_Alert_${employeeName}.ics`);
}

function downloadIcs(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}