import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { colors, spacing, radius } from '@/src/theme';
import { api, Content } from '@/src/api';

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

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.getContent(id);
      setC(data);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  };

  const copy = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    flash(`${label} copied`);
  };

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
    setScheduling(true);
    try {
      const updated = await api.schedule(c.id, dt.toISOString());
      setC(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      flash('Scheduled!');
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable testID="content-back-button" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.topTitle}>YOUR DROP</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 160 }}>
        {/* Viral score hero */}
        <View style={styles.hero}>
          <View style={styles.metaRow}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{c.niche.toUpperCase()}</Text>
            </View>
            <Text style={styles.metaText}>
              {c.duration} • {c.language} • {c.tone}
            </Text>
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
          <Pressable
            key={i}
            testID={`idea-${i}`}
            onPress={() => copy(idea, `Idea ${i + 1}`)}
            style={styles.ideaCard}
          >
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

        {/* Voiceover */}
        <SectionTitle icon="mic" title="VOICEOVER" onCopy={() => copy(c.voiceover_text, 'Voiceover')} />
        <View style={styles.textCard}>
          <Text style={styles.body}>{c.voiceover_text}</Text>
        </View>

        {/* Thumbnail */}
        <SectionTitle icon="image" title="THUMBNAIL IDEA" onCopy={() => copy(c.thumbnail_idea, 'Thumbnail idea')} />
        <View style={styles.textCard}>
          <Text style={styles.body}>{c.thumbnail_idea}</Text>
        </View>

        {/* Caption */}
        <SectionTitle icon="chatbubble-ellipses" title="CAPTION" onCopy={() => copy(c.caption, 'Caption')} />
        <View style={styles.textCard}>
          <Text style={styles.body}>{c.caption}</Text>
        </View>

        {/* Hashtags */}
        <SectionTitle
          icon="pricetags"
          title={`HASHTAGS (${c.hashtags.length})`}
          onCopy={() => copy(c.hashtags.join(' '), 'Hashtags')}
        />
        <View style={styles.tagWrap}>
          {c.hashtags.map((h, i) => (
            <View key={i} style={styles.hashPill}>
              <Text style={styles.hashText}>{h}</Text>
            </View>
          ))}
        </View>

        {c.scheduled_at && (
          <View style={styles.scheduledBox}>
            <Ionicons name="calendar" size={16} color={colors.brandPrimary} />
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

      {/* iOS: modal with inline picker + confirm; Android: native dialog via state */}
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
            <Pressable
              testID="schedule-confirm-button"
              onPress={() => confirmSchedule()}
              style={styles.cta}
            >
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

  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  hashPill: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  hashText: { color: colors.brandPrimary, fontSize: 12, fontWeight: '700' },

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
