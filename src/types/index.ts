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
export interface WeeklySummary {
    weekKey: string;           // e.g., "2026-W33"
    startDate: string;         // Monday (YYYY-MM-DD)
    endDate: string;           // Sunday (YYYY-MM-DD)
    payDate: string;           // Following Thursday (YYYY-MM-DD)
    totalHours: number;        // Total scheduled hours
    shiftCount: number;        // Number of shifts
    hourlyRate: number;        // $18.10
    grossPay: number;          // totalHours * 18.10
    estimatedTax: number;      // Federal/Provincial Tax (~9.24%)
    estimatedCpp: number;      // CPP (~5.33%)
    estimatedEi: number;       // EI (~1.63%)
    totalDeductions: number;   // Tax + CPP + EI (~16.2%)
    estimatedNetPay: number;   // Take-home pay (~83.8%)
}