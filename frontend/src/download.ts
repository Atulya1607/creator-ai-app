import { Platform, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/**
 * Open the media URL for download/share.
 * - Web: opens in new tab (browser handles download)
 * - Native: downloads to cache dir then opens share sheet (save to Photos, Files, etc.)
 */
export async function downloadOrShare(
  url: string,
  filename: string,
  mimeType?: string,
): Promise<void> {
  if (Platform.OS === 'web') {
    Linking.openURL(url);
    return;
  }
  try {
    const dest = FileSystem.cacheDirectory + filename;
    const { uri } = await FileSystem.downloadAsync(url, dest);
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType,
        dialogTitle: 'Save or share',
        UTI: mimeType?.startsWith('image/') ? 'public.image' : undefined,
      });
    } else {
      Linking.openURL(uri);
    }
  } catch {
    // Fallback: open the remote URL in browser
    Linking.openURL(url);
  }
}
