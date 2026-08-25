import { Shift } from '../types';

export async function setupNotificationChannels(): Promise<boolean> {
    return true;
}

export async function scheduleShiftAlarms(shifts: Shift[]): Promise<void> {
    // Web fallback: shifts are saved and displayed in the UI
}