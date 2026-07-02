import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureNotifPermission(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return { granted: true, canAskAgain: true };
  if (!current.canAskAgain) return { granted: false, canAskAgain: false };
  const req = await Notifications.requestPermissionsAsync();
  return { granted: !!req.granted, canAskAgain: !!req.canAskAgain };
}

export async function scheduleReminder(opts: {
  contentId: string;
  title: string;
  body: string;
  when: Date;
}): Promise<string | null> {
  const seconds = Math.max(1, Math.floor((opts.when.getTime() - Date.now()) / 1000));

  // Android channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('creatorai-reminders', {
      name: 'CreatorAI reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#CCFF00',
    });
  }

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: opts.title,
      body: opts.body,
      data: { contentId: opts.contentId },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
      channelId: Platform.OS === 'android' ? 'creatorai-reminders' : undefined,
    },
  });
  return id;
}

export async function cancelReminder(id: string | null | undefined) {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {}
}
