/**
 * Standard Application Date & Time Utilities
 */

/**
 * Returns today's ISO date string strictly in the America/Toronto timezone (YYYY-MM-DD).
 */
export function getTorontoTodayStr(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
}

/**
 * Formats an ISO date string (YYYY-MM-DD) into a standard human-readable display date.
 * Example: "2026-09-01" -> "Tue, Sep 1, 2026"
 */
export function formatDisplayDate(dateStr?: string | null): string {
    if (!dateStr) return '';
    // Append T00:00:00 to prevent UTC midnight date shift
    const cleanDate = dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`;
    const d = new Date(cleanDate);
    if (isNaN(d.getTime())) return dateStr;

    return d.toLocaleDateString('en-US', {
        weekday: 'short', // "Tue"
        month: 'short',   // "Sep"
        day: 'numeric',   // "1"
        year: 'numeric',  // "2026"
    });
}

/**
 * Formats a date without the year for compact table/list headers.
 * Example: "2026-09-01" -> "Tue, Sep 1"
 */
export function formatShortDate(dateStr?: string | null): string {
    if (!dateStr) return '';
    const cleanDate = dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`;
    const d = new Date(cleanDate);
    if (isNaN(d.getTime())) return dateStr;

    return d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });
}

/**
 * Formats standard 24h shift strings ("14:30") to 12h readable time ("2:30 PM").
 */
export function formatDisplayTime(timeStr?: string | null): string {
    if (!timeStr || timeStr === '00:00') return '';
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return timeStr;

    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    const displayM = m < 10 ? `0${m}` : `${m}`;
    return `${displayH}:${displayM} ${period}`;
}