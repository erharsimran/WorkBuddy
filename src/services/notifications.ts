import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import { Shift } from '../types';

Notifications.setNotificationHandler({
    handleNotification: async (): Promise<Notifications.NotificationBehavior> => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export async function setupNotificationChannels(): Promise<boolean> {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return false;

    await Notifications.setNotificationChannelAsync('shift-alarms', {
        name: 'Shift Alarms',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        sound: 'loud_alarm.wav',
        enableVibrate: true,
    });

    return true;
}

export async function scheduleShiftAlarms(shifts: Shift[]): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const now = new Date();

    for (const shift of shifts) {
        const shiftDate = new Date(`${shift.date}T${shift.startTime}:00`);
        const oneDayBefore = new Date(shiftDate.getTime() - 24 * 60 * 60 * 1000);
        const twoHoursBefore = new Date(shiftDate.getTime() - 2 * 60 * 60 * 1000);

        // 1. Alert: 24h Before
        if (oneDayBefore > now) {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: 'Upcoming Shift Tomorrow!',
                    body: `You are scheduled tomorrow from ${shift.startTime} to ${shift.endTime}.`,
                    sound: 'loud_alarm.wav',
                },
                trigger: {
                    type: SchedulableTriggerInputTypes.DATE,
                    date: oneDayBefore,
                },
            });
        }

        // 2. Alert: 2h Before
        if (twoHoursBefore > now) {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: 'Shift in 2 Hours!',
                    body: `Get ready! Your shift starts at ${shift.startTime}.`,
                    sound: 'loud_alarm.wav',
                },
                trigger: {
                    type: SchedulableTriggerInputTypes.DATE,
                    date: twoHoursBefore,
                },
            });
        }
    }
}