import { ShiftDbRow, CoworkerShift } from '../types';

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

      const coworkerListText = shift.coworkers && shift.coworkers.length > 0
          ? shift.coworkers.map((c: CoworkerShift | string) =>
              typeof c === 'string' ? c : `${c.name} [${c.startTime} - ${c.endTime}]`
          ).join('\\n• ')
          : 'None';

      const description = `Team Schedule:\\n• ${coworkerListText}`;

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
          `DESCRIPTION:${description}`,
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

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${employeeName}_Work_Schedule.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}