export interface CoworkerShift {
    name: string;
    startTime: string; // e.g. "12:00"
    endTime: string;   // e.g. "21:30"
    phone?: string | null;
}

export interface Shift {
    date: string;
    startTime: string;
    endTime: string;
    hours: number;
    coworkers?: CoworkerShift[];
}

export interface ShiftDbRow {
    id: number;
    date: string;
    start_time: string;
    end_time: string;
    hours: number;
    coworkers?: CoworkerShift[];
}

export interface WeeklySummary {
    weekKey: string;
    startDate: string;
    endDate: string;
    payDate: string;
    totalHours: number;
    shiftCount: number;
    hourlyRate: number;
    grossPay: number;
    estimatedTax: number;
    estimatedCpp: number;
    estimatedEi: number;
    totalDeductions: number;
    estimatedNetPay: number;
}