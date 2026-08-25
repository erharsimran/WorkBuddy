export interface Shift {
    id?: number;
    date: string;       // Format: YYYY-MM-DD
    startTime: string;  // Format: HH:mm (24h)
    endTime: string;    // Format: HH:mm (24h)
    hours: number;
    coworkers?: string[];
}

export interface ShiftDbRow {
    id: number;
    date: string;
    start_time: string;
    end_time: string;
    hours: number;
    coworkers?: string[];
}