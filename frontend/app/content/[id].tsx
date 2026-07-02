import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, Platform, Image,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';

import { colors, spacing, radius } from '@/src/theme';
import { api, Content } from '@/src/api';
import { ensureNotifPermission, scheduleReminder } from '@/src/notifications';
import { downloadOrShare } from '@/src/download';

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL as string;

export default function ContentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [c, setC] = useState<Content | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickedDate, setPickedDate] = useState<Date>(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [scheduling, setScheduling] = useState(false);

  // TTS + video + thumbnail state
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const [thumbBusy, setThumbBusy] = useState(false);

  const player = useAudioPlayer(audioUri ? { uri: audioUri } : null);
  const playerStatus = useAudioPlayerStatus(player);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.getContent(id);
      setC(data);
      // If audio previously generated, point to server file
      if (data.voiceover_ready) {
        setAudioUri(`${BACKEND}/api/media/${data.id}.mp3`);
      }
      if (data.video_ready) {
        setVideoUri(`${BACKEND}/api/media/${data.id}.mp4`);
      }
      if (data.thumbnail_ready) {
        setThumbUri(`${BACKEND}/api/media/${data.id}.png`);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // Auto-stop when finished
  const wasPlaying = useRef(false);
  useEffect(() => {
    if (playerStatus?.playing) wasPlaying.current = true;
    if (wasPlaying.current && playerStatus?.didJustFinish) {
      wasPlaying.current = false;
    }
  }, [playerStatus?.playing, playerStatus?.didJustFinish]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const copy = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    flash(`${label} copied`);
  };

  // ---- TTS ----
  const genVoiceover = async () => {
    if (!c) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTtsBusy(true);
    try {
      const r = await api.voiceover(c.id, 'nova', 1.0);
      // Prefer server file (streamable). Fallback to base64 data uri.
      const uri = `${BACKEND}/api/media/${r.id}.mp3?ts=${Date.now()}`;
      setAudioUri(uri);
      setC({ ...c, voiceover_ready: true, voiceover_voice: r.voice });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      flash('Voiceover ready');
    } catch (e: any) {
      flash(e.message || 'TTS failed');
    } finally {
      setTtsBusy(false);
    }
  };

  const togglePlay = () => {
    if (!player) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (playerStatus?.playing) {
      player.pause();
    } else {
      if (playerStatus?.didJustFinish || (playerStatus?.currentTime ?? 0) >= (playerStatus?.duration ?? 0)) {
        player.seekTo(0);
      }
      player.play();
    }
  };

  // ---- Video ----
  const genVideo = async () => {
    if (!c) return;
    if (!c.voiceover_ready) {
      flash('Generate voiceover first');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setVideoBusy(true);
    try {
      const r = await api.video(c.id);
      setVideoUri(`${BACKEND}${r.video_url}?ts=${Date.now()}`);
      setC({ ...c, video_ready: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      flash('Video rendered!');
    } catch (e: any) {
      flash(e.message || 'Video failed');
    } finally {
      setVideoBusy(false);
    }
  };

  // ---- Thumbnail ----
  const genThumbnail = async () => {
    if (!c) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setThumbBusy(true);
    try {
      const r = await api.thumbnail(c.id);
      setThumbUri(`${BACKEND}${r.image_url}?ts=${Date.now()}`);
      setC({ ...c, thumbnail_ready: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      flash('Thumbnail ready');
    } catch (e: any) {
      flash(e.message || 'Thumbnail failed');
    } finally {
      setThumbBusy(false);
    }
  };

  // ---- Download helpers ----
  const dl = async (url: string, name: string, mime: string, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await downloadOrShare(url, name, mime);
      flash(`${label} ready to save`);
    } catch {
      flash('Download failed');
    }
  };

  // ---- Scheduler ----
  const openScheduler = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPickerMode('date');
    setShowPicker(true);
  };

  const onPickerChange = (_e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
      if (!d) return;
      if (pickerMode === 'date') {
        const merged = new Date(pickedDate);
        merged.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
        setPickedDate(merged);
        setPickerMode('time');
        setTimeout(() => setShowPicker(true), 100);
      } else {
        const merged = new Date(pickedDate);
        merged.setHours(d.getHours(), d.getMinutes(), 0, 0);
        setPickedDate(merged);
        confirmSchedule(merged);
      }
    } else if (d) {
      setPickedDate(d);
    }
  };

  const confirmSchedule = async (when?: Date) => {
    if (!c) return;
    const dt = when || pickedDate;
    if (dt.getTime() <= Date.now()) {
      flash('Pick a future time');
      return;
    }
    setScheduling(true);
    try {
      const updated = await api.schedule(c.id, dt.toISOString());
      setC(updated);
      // Fire local reminder
      const perm = await ensureNotifPermission();
      if (perm.granted) {
        await scheduleReminder({
          contentId: c.id,
          title: 'Time to post!',
          body: (c.caption || c.ideas?.[0] || 'Your CreatorAI drop is ready.').slice(0, 120),
          when: dt,
        });
        flash('Scheduled + reminder set');
      } else {
        flash('Scheduled (enable notifications for reminders)');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      flash(e.message || 'Failed');
    } finally {
      setScheduling(false);
      setShowPicker(false);
    }
  };

  if (loading || !c) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </SafeAreaView>
    );
  }

  const progress = playerStatus?.duration
    ? Math.min(1, (playerStatus.currentTime ?? 0) / playerStatus.duration)
    : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable testID="content-back-button" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.topTitle}>YOUR DROP</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 200 }}>
        {/* Viral score hero */}
        <View style={styles.hero}>
          <View style={styles.metaRow}>
            <View style={styles.tag}><Text style={styles.tagText}>{c.niche.toUpperCase()}</Text></View>
            <Text style={styles.metaText}>{c.duration} • {c.language} • {c.tone}</Text>
          </View>

          <View style={styles.scoreRow}>
            <View>
              <Text style={styles.scoreLabel}>VIRAL SCORE</Text>
              <Text testID="viral-score" style={styles.scoreVal}>{c.viral_score}<Text style={styles.scoreOf}>/10</Text></Text>
            </View>
            <View style={styles.flameBox}>
              <Ionicons name="flame" size={40} color={colors.brandPrimary} />
            </View>
          </View>
          <Text style={styles.scoreReason}>{c.viral_reasoning}</Text>
        </View>

        {/* Ideas */}
        <SectionTitle icon="bulb" title="TRENDING IDEAS" />
        {c.ideas.map((idea, i) => (
          <Pressable key={i} testID={`idea-${i}`} onPress={() => copy(idea, `Idea ${i + 1}`)} style={styles.ideaCard}>
            <Text style={styles.ideaNum}>{i + 1}</Text>
            <Text style={styles.ideaText}>{idea}</Text>
            <Ionicons name="copy-outline" size={18} color={colors.onSurfaceSecondary} />
          </Pressable>
        ))}

        {/* Script */}
        <SectionTitle icon="document-text" title="SCRIPT" onCopy={() => copy(c.script, 'Script')} />
        <View style={styles.textCard}>
          <Text testID="script-text" style={styles.mono}>{c.script}</Text>
        </View>

        {/* Voiceover with TTS */}
        <SectionTitle icon="mic" title="VOICEOVER" onCopy={() => copy(c.voiceover_text, 'Voiceover')} />
        <View style={styles.textCard}>
          <Text style={styles.body}>{c.voiceover_text}</Text>

          <View style={styles.playerRow}>
            {!audioUri ? (
              <Pressable
                testID="voiceover-generate-button"
                onPress={genVoiceover}
                disabled={ttsBusy}
                style={styles.playPill}
              >
                {ttsBusy ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <Ionicons name="mic" size={16} color={colors.onBrandPrimary} />
                    <Text style={styles.playText}>GENERATE VOICEOVER</Text>
                  </>
                )}
              </Pressable>
            ) : (
              <View style={{ gap: spacing.sm }}>
                <View style={styles.playerBox}>
                  <Pressable
                    testID="voiceover-play-button"
                    onPress={togglePlay}
                    style={styles.playCircle}
                  >
                    <Ionicons
                      name={playerStatus?.playing ? 'pause' : 'play'}
                      size={22}
                      color={colors.onBrandPrimary}
                    />
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <View style={styles.trackBg}>
                      <View style={[styles.trackFg, { width: `${progress * 100}%` }]} />
                    </View>
                    <Text style={styles.trackTime}>
                      {fmtTime(playerStatus?.currentTime ?? 0)} / {fmtTime(playerStatus?.duration ?? 0)}
                      {c.voiceover_voice ? `  • ${c.voiceover_voice}` : ''}
                    </Text>
                  </View>
                </View>
                <Pressable
                  testID="voiceover-download-button"
                  onPress={() => dl(audioUri, `${c.id}.mp3`, 'audio/mpeg', 'Voiceover')}
                  style={[styles.actionBtn, styles.actionBtnGhost, { alignSelf: 'flex-start' }]}
                >
                  <Ionicons name="download" size={14} color={colors.brandPrimary} />
                  <Text style={[styles.actionBtnText, { color: colors.brandPrimary }]}>
                    DOWNLOAD MP3
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Thumbnail — AI image generation */}
        <SectionTitle icon="image" title="THUMBNAIL" />
        <View style={styles.textCard}>
          <Text style={[styles.body, { marginBottom: spacing.md }]}>{c.thumbnail_idea}</Text>

          {thumbUri ? (
            <View style={{ gap: spacing.md }}>
              <Image
                testID="thumbnail-image"
                source={{ uri: thumbUri }}
                style={styles.thumbImage}
                resizeMode="cover"
              />
              <View style={styles.actionRow}>
                <Pressable
                  testID="thumbnail-download-button"
                  onPress={() => dl(thumbUri, `${c.id}.png`, 'image/png', 'Thumbnail')}
                  style={styles.actionBtn}
                >
                  <Ionicons name="download" size={16} color={colors.onBrandPrimary} />
                  <Text style={styles.actionBtnText}>DOWNLOAD</Text>
                </Pressable>
                <Pressable
                  testID="thumbnail-regenerate-button"
                  onPress={genThumbnail}
                  disabled={thumbBusy}
                  style={[styles.actionBtn, styles.actionBtnGhost]}
                >
                  {thumbBusy ? (
                    <ActivityIndicator color={colors.brandPrimary} />
                  ) : (
                    <>
                      <Ionicons name="refresh" size={14} color={colors.brandPrimary} />
                      <Text style={[styles.actionBtnText, { color: colors.brandPrimary }]}>
                        REGENERATE
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              testID="thumbnail-generate-button"
              onPress={genThumbnail}
              disabled={thumbBusy}
              style={styles.playPill}
            >
              {thumbBusy ? (
                <>
                  <ActivityIndicator color={colors.onBrandPrimary} />
                  <Text style={styles.playText}>PAINTING PIXELS…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="image" size={16} color={colors.onBrandPrimary} />
                  <Text style={styles.playText}>GENERATE THUMBNAIL</Text>
                </>
              )}
            </Pressable>
          )}
          <Pressable
            testID="copy-thumbnail-idea"
            onPress={() => copy(c.thumbnail_idea, 'Thumbnail idea')}
            style={[styles.copyBtn, { alignSelf: 'flex-start', marginTop: spacing.md }]}
          >
            <Ionicons name="copy-outline" size={14} color={colors.onSurface} />
            <Text style={styles.copyText}>COPY IDEA TEXT</Text>
          </Pressable>
        </View>

        {/* Caption */}
        <SectionTitle icon="chatbubble-ellipses" title="CAPTION" onCopy={() => copy(c.caption, 'Caption')} />
        <View style={styles.textCard}><Text style={styles.body}>{c.caption}</Text></View>

        {/* Hashtags */}
        <SectionTitle
          icon="pricetags"
          title={`HASHTAGS (${c.hashtags.length})`}
          onCopy={() => copy(c.hashtags.join(' '), 'Hashtags')}
        />
        <View style={styles.tagWrap}>
          {c.hashtags.map((h, i) => (
            <View key={i} style={styles.hashPill}><Text style={styles.hashText}>{h}</Text></View>
          ))}
        </View>

        {/* Video export */}
        <SectionTitle icon="film" title="VIDEO EXPORT" />
        <View style={styles.textCard}>
          <Text style={styles.body}>
            Render a vertical MP4 (1080×1920) with your voiceover + on-screen text
            {c.thumbnail_ready ? ' over your AI thumbnail background' : ''} — ready to upload.
          </Text>
          {!videoUri ? (
            <Pressable
              testID="video-generate-button"
              onPress={genVideo}
              disabled={videoBusy}
              style={[styles.playPill, { marginTop: spacing.md }]}
            >
              {videoBusy ? (
                <>
                  <ActivityIndicator color={colors.onBrandPrimary} />
                  <Text style={styles.playText}>RENDERING…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="film" size={16} color={colors.onBrandPrimary} />
                  <Text style={styles.playText}>
                    {c.voiceover_ready ? 'RENDER MP4' : 'GENERATE VOICEOVER FIRST'}
                  </Text>
                </>
              )}
            </Pressable>
          ) : (
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              <View style={styles.videoBadge}>
                <Ionicons name="checkmark-circle" size={16} color={colors.brandPrimary} />
                <Text style={styles.videoBadgeText}>
                  MP4 ready {c.thumbnail_ready ? '(with AI thumbnail)' : ''}
                </Text>
              </View>
              <View style={styles.actionRow}>
                <Pressable
                  testID="video-download-button"
                  onPress={() => dl(videoUri, `${c.id}.mp4`, 'video/mp4', 'Video')}
                  style={styles.actionBtn}
                >
                  <Ionicons name="download" size={16} color={colors.onBrandPrimary} />
                  <Text style={styles.actionBtnText}>DOWNLOAD MP4</Text>
                </Pressable>
                <Pressable
                  testID="video-regenerate-button"
                  onPress={genVideo}
                  disabled={videoBusy}
                  style={[styles.actionBtn, styles.actionBtnGhost]}
                >
                  {videoBusy ? (
                    <ActivityIndicator color={colors.brandPrimary} />
                  ) : (
                    <>
                      <Ionicons name="refresh" size={14} color={colors.brandPrimary} />
                      <Text style={[styles.actionBtnText, { color: colors.brandPrimary }]}>
                        RE-RENDER
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {c.scheduled_at && (
          <View style={styles.scheduledBox}>
            <Ionicons name="calendar" size={16} color={colors.onBrandTertiary} />
            <Text style={styles.scheduledText}>
              Scheduled: {new Date(c.scheduled_at).toLocaleString()}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.stickyBar}>
        <Pressable
          testID="schedule-cta-button"
          onPress={openScheduler}
          disabled={scheduling}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
        >
          {scheduling ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <Ionicons name="calendar" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.ctaText}>
                {c.scheduled_at ? 'RESCHEDULE POST' : 'SCHEDULE POST'}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {Platform.OS === 'ios' && (
        <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
          <Pressable style={styles.modalBg} onPress={() => setShowPicker(false)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>WHEN TO POST?</Text>
            <DateTimePicker
              value={pickedDate}
              mode="datetime"
              display="spinner"
              minimumDate={new Date()}
              onChange={onPickerChange}
              textColor={colors.onSurface}
              themeVariant="dark"
            />
            <Pressable testID="schedule-confirm-button" onPress={() => confirmSchedule()} style={styles.cta}>
              <Text style={styles.ctaText}>CONFIRM SCHEDULE</Text>
            </Pressable>
          </View>
        </Modal>
      )}

      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker
          value={pickedDate}
          mode={pickerMode}
          is24Hour={false}
          minimumDate={new Date()}
          onChange={onPickerChange}
        />
      )}

      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={16} color={colors.onBrandPrimary} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function fmtTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function SectionTitle({
  icon, title, onCopy,
}: { icon: keyof typeof Ionicons.glyphMap; title: string; onCopy?: () => void }) {
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionLeft}>
        <Ionicons name={icon} size={16} color={colors.brandPrimary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {onCopy && (
        <Pressable
          testID={`copy-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
          onPress={onCopy}
          style={styles.copyBtn}
        >
          <Ionicons name="copy-outline" size={14} color={colors.onSurface} />
          <Text style={styles.copyText}>COPY</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, paddingBottom: 0 },
  iconBtn: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  topTitle: { color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 2, fontWeight: '800' },

  hero: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.brandTertiary,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tag: { backgroundColor: colors.brandPrimary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  tagText: { color: colors.onBrandPrimary, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  metaText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: '700' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  scoreLabel: { color: colors.brandPrimary, fontSize: 11, letterSpacing: 1.5, fontWeight: '800' },
  scoreVal: { color: colors.onSurface, fontSize: 64, fontWeight: '900', lineHeight: 66, letterSpacing: -2 },
  scoreOf: { color: colors.onSurfaceSecondary, fontSize: 22, fontWeight: '800' },
  flameBox: { width: 72, height: 72, borderRadius: radius.pill, backgroundColor: 'rgba(204,255,0,0.08)', alignItems: 'center', justifyContent: 'center' },
  scoreReason: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: spacing.md, lineHeight: 18 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.md },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { color: colors.onSurface, fontSize: 13, letterSpacing: 1.5, fontWeight: '900' },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill },
  copyText: { color: colors.onSurface, fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  ideaCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.lg, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  ideaNum: {
    width: 28, height: 28, borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary, color: colors.onBrandTertiary,
    textAlign: 'center', lineHeight: 28, fontWeight: '900',
  },
  ideaText: { flex: 1, color: colors.onSurface, fontSize: 14, lineHeight: 20 },

  textCard: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  mono: { color: colors.onSurface, fontSize: 14, lineHeight: 22, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
  body: { color: colors.onSurface, fontSize: 15, lineHeight: 22 },

  playerRow: { marginTop: spacing.md },
  playPill: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingVertical: 12, paddingHorizontal: spacing.lg,
  },
  playText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1, fontSize: 13 },
  playerBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md,
  },
  playCircle: {
    width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.brandPrimary,
    alignItems: 'center', justifyContent: 'center',
  },
  trackBg: { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  trackFg: { height: 4, backgroundColor: colors.brandPrimary },
  trackTime: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 6, fontWeight: '700' },

  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  hashPill: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  hashText: { color: colors.brandPrimary, fontSize: 12, fontWeight: '700' },

  videoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.brandTertiary, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill,
  },
  videoBadgeText: { color: colors.onBrandTertiary, fontSize: 12, fontWeight: '800' },
  videoUrlBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary, padding: spacing.md, borderRadius: radius.md,
  },
  videoUrl: { flex: 1, color: colors.onSurface, fontSize: 11, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },

  thumbImage: {
    width: '100%', aspectRatio: 9 / 16, maxHeight: 420,
    borderRadius: radius.md, backgroundColor: colors.surfaceTertiary,
  },
  actionRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, paddingVertical: 12,
    borderRadius: radius.pill,
  },
  actionBtnGhost: {
    backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border,
  },
  actionBtnText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1, fontSize: 12 },

  scheduledBox: {
    marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.brandTertiary, padding: spacing.md, borderRadius: radius.md,
  },
  scheduledText: { color: colors.onBrandTertiary, fontWeight: '800' },

  stickyBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: spacing.lg, paddingBottom: spacing.xl,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  cta: {
    backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingVertical: 18, flexDirection: 'row', gap: spacing.sm,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.md,
  },
  ctaText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1, fontSize: 15 },

  modalBg: { flex: 1, backgroundColor: colors.overlay },
  modalSheet: {
    backgroundColor: colors.surfaceSecondary, padding: spacing.lg, paddingBottom: spacing.xxl,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
  },
  modalTitle: { color: colors.onSurface, fontSize: 16, fontWeight: '900', letterSpacing: 1, textAlign: 'center', marginBottom: spacing.md },

  toast: {
    position: 'absolute', bottom: 120, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, paddingVertical: 12,
    borderRadius: radius.pill,
  },
  toastText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 0.5 },
});
