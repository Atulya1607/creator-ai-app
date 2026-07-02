import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { colors, spacing, radius, NICHES, TONES, DURATIONS, LANGUAGES } from '@/src/theme';
import { api } from '@/src/api';
import { useAuth } from '@/src/auth';

export default function Create() {
  const { user } = useAuth();
  const router = useRouter();

  const initialNiche = user?.niche || NICHES[0];
  const [niche, setNiche] = useState<string>(initialNiche);
  const [customNiche, setCustomNiche] = useState<string>(
    !NICHES.includes(initialNiche) ? initialNiche : ''
  );
  const [showCustom, setShowCustom] = useState<boolean>(!NICHES.includes(initialNiche));
  const [tone, setTone] = useState<string>(TONES[0]);
  const [duration, setDuration] = useState<string>(DURATIONS[1]);
  const [language, setLanguage] = useState<string>(LANGUAGES[0]);
  const [audience, setAudience] = useState<string>('Gen-Z creators');
  const [topic, setTopic] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [batchModal, setBatchModal] = useState(false);
  const [batchCount, setBatchCount] = useState<number>(10);

  const effectiveNiche = showCustom ? customNiche.trim() : niche;

  const applyCustom = () => {
    if (!customNiche.trim()) {
      setErr('Enter your custom niche');
      return;
    }
    setNiche(customNiche.trim());
    setErr(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const generate = async () => {
    setErr(null);
    if (!effectiveNiche) {
      setErr('Pick or enter a niche');
      return;
    }
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const c = await api.generate({
        niche: effectiveNiche,
        tone,
        duration,
        language,
        target_audience: audience || 'Gen-Z creators',
        topic: topic.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push({ pathname: '/content/[id]', params: { id: c.id } });
    } catch (e: any) {
      setErr(e.message || 'Generation failed. Try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  const runBatch = async () => {
    setErr(null);
    if (!effectiveNiche) {
      setErr('Pick or enter a niche');
      return;
    }
    if (!topic.trim()) {
      setErr('Enter a seed topic to spin off 10 variations from');
      return;
    }
    setBatchBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const items = await api.batch({
        seed_idea: topic.trim(),
        niche: effectiveNiche,
        tone,
        duration,
        language,
        count: batchCount,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBatchModal(false);
      // Land on the first newly created content
      if (items[0]) {
        router.push({ pathname: '/content/[id]', params: { id: items[0].id } });
      } else {
        router.push('/(tabs)');
      }
    } catch (e: any) {
      setErr(e.message || 'Batch failed');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBatchBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 200 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.eyebrow}>CONTENT ENGINE</Text>
          <Text style={styles.h1}>GENERATE{'\n'}A VIRAL DROP.</Text>

          <SectionLabel>NICHE</SectionLabel>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
            style={{ marginBottom: spacing.md }}
          >
            {NICHES.map((n) => {
              const active = !showCustom && niche === n;
              return (
                <Pressable
                  key={n}
                  testID={`niche-chip-${n.toLowerCase()}`}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setNiche(n);
                    setShowCustom(false);
                  }}
                  style={[chipStyles.chip, active && chipStyles.chipActive]}
                >
                  <Text style={[chipStyles.chipText, active && chipStyles.chipTextActive]}>{n}</Text>
                </Pressable>
              );
            })}
            <Pressable
              testID="niche-chip-custom"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowCustom(true);
              }}
              style={[chipStyles.chip, chipStyles.chipCustom, showCustom && chipStyles.chipActive]}
            >
              <Ionicons name="add-circle" size={14} color={showCustom ? colors.brandPrimary : colors.onSurface} />
              <Text style={[chipStyles.chipText, showCustom && chipStyles.chipTextActive]}>Custom</Text>
            </Pressable>
          </ScrollView>

          {showCustom && (
            <View style={styles.customBox}>
              <TextInput
                testID="create-custom-niche-input"
                value={customNiche}
                onChangeText={setCustomNiche}
                onBlur={applyCustom}
                placeholder="e.g. Chess opening theory, iOS shortcuts"
                placeholderTextColor={colors.onSurfaceSecondary}
                style={styles.customInput}
              />
              <Pressable
                testID="create-custom-niche-apply"
                onPress={applyCustom}
                style={styles.customApply}
              >
                <Text style={styles.customApplyText}>USE</Text>
              </Pressable>
            </View>
          )}

          <SectionLabel>TONE</SectionLabel>
          <ChipRow items={TONES} value={tone} onChange={setTone} testPrefix="tone" />

          <SectionLabel>DURATION</SectionLabel>
          <SegmentedRow items={DURATIONS} value={duration} onChange={setDuration} testPrefix="duration" />

          <SectionLabel>LANGUAGE</SectionLabel>
          <SegmentedRow items={LANGUAGES} value={language} onChange={setLanguage} testPrefix="language" />

          <SectionLabel>TARGET AUDIENCE</SectionLabel>
          <TextInput
            testID="create-audience-input"
            value={audience}
            onChangeText={setAudience}
            placeholder="e.g. Gen-Z creators, fitness beginners"
            placeholderTextColor={colors.onSurfaceSecondary}
            style={styles.input}
          />

          <SectionLabel>TOPIC (optional for single, required for batch)</SectionLabel>
          <TextInput
            testID="create-topic-input"
            value={topic}
            onChangeText={setTopic}
            placeholder="Seed idea, e.g. 'AI tools for students'"
            placeholderTextColor={colors.onSurfaceSecondary}
            multiline
            style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
          />

          <Pressable
            testID="create-batch-open"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setBatchModal(true);
            }}
            style={styles.batchCard}
          >
            <View style={styles.batchIcon}>
              <Ionicons name="albums" size={20} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.batchTitle}>10 videos from 1 idea</Text>
              <Text style={styles.batchSub}>Spin off a full week of variations in one go.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceSecondary} />
          </Pressable>

          {err && <Text style={styles.err}>{err}</Text>}
        </ScrollView>

        <View style={styles.stickyBar}>
          <Pressable
            testID="create-generate-button"
            onPress={generate}
            disabled={busy}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          >
            {busy ? (
              <>
                <ActivityIndicator color={colors.onBrandPrimary} />
                <Text style={styles.ctaText}>AI IS COOKING…</Text>
              </>
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.ctaText}>GENERATE MAGIC</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Batch modal */}
      <Modal visible={batchModal} transparent animationType="slide" onRequestClose={() => setBatchModal(false)}>
        <Pressable style={styles.modalBg} onPress={() => !batchBusy && setBatchModal(false)} />
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>BATCH GENERATE</Text>
          <Text style={styles.modalBody}>
            Uses your current niche, tone, duration, language + the topic below as the seed. Creates {batchCount} distinct video variations.
          </Text>

          <Text style={styles.modalLabel}>SEED IDEA</Text>
          <TextInput
            testID="batch-topic-input"
            value={topic}
            onChangeText={setTopic}
            placeholder="e.g. 'AI tools every student should try'"
            placeholderTextColor={colors.onSurfaceSecondary}
            multiline
            style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
          />

          <Text style={styles.modalLabel}>HOW MANY?</Text>
          <View style={styles.countRow}>
            {[3, 5, 10].map((n) => (
              <Pressable
                key={n}
                testID={`batch-count-${n}`}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setBatchCount(n);
                }}
                style={[styles.countPill, batchCount === n && styles.countPillActive]}
              >
                <Text style={[styles.countText, batchCount === n && styles.countTextActive]}>{n}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            testID="create-batch-run-button"
            onPress={runBatch}
            disabled={batchBusy}
            style={styles.cta}
          >
            {batchBusy ? (
              <>
                <ActivityIndicator color={colors.onBrandPrimary} />
                <Text style={styles.ctaText}>SPINNING UP {batchCount} DROPS…</Text>
              </>
            ) : (
              <>
                <Ionicons name="rocket" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.ctaText}>GENERATE {batchCount}</Text>
              </>
            )}
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

function ChipRow({
  items, value, onChange, testPrefix,
}: { items: string[]; value: string; onChange: (v: string) => void; testPrefix: string }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
      style={{ marginBottom: spacing.md }}
    >
      {items.map((it) => {
        const active = value === it;
        return (
          <Pressable
            key={it}
            testID={`${testPrefix}-chip-${it.toLowerCase()}`}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(it);
            }}
            style={[chipStyles.chip, active && chipStyles.chipActive]}
          >
            <Text style={[chipStyles.chipText, active && chipStyles.chipTextActive]}>{it}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SegmentedRow({
  items, value, onChange, testPrefix,
}: { items: string[]; value: string; onChange: (v: string) => void; testPrefix: string }) {
  return (
    <View style={styles.segRow}>
      {items.map((it) => {
        const active = value === it;
        return (
          <Pressable
            key={it}
            testID={`${testPrefix}-seg-${it.toLowerCase()}`}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(it);
            }}
            style={[styles.seg, active && styles.segActive]}
          >
            <Text style={[styles.segText, active && styles.segTextActive]}>{it}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexShrink: 0, height: 36, paddingHorizontal: spacing.lg, justifyContent: 'center',
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurface, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: colors.onBrandTertiary },
  chipCustom: { flexDirection: 'row', gap: 4, alignItems: 'center' },
});

const styles = StyleSheet.create({
  eyebrow: { color: colors.brandPrimary, fontSize: 12, letterSpacing: 2, fontWeight: '800' },
  h1: { color: colors.onSurface, fontSize: 36, fontWeight: '900', lineHeight: 40, letterSpacing: -1, marginTop: spacing.xs },
  section: {
    color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 1.5,
    marginTop: spacing.xl, marginBottom: spacing.md,
  },
  segRow: {
    flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.surfaceSecondary,
    padding: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
  },
  seg: {
    flex: 1, paddingVertical: 12, borderRadius: radius.pill, alignItems: 'center',
  },
  segActive: { backgroundColor: colors.brandPrimary },
  segText: { color: colors.onSurface, fontWeight: '800', fontSize: 13 },
  segTextActive: { color: colors.onBrandPrimary, fontWeight: '900' },
  input: {
    backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14,
    fontSize: 15, borderWidth: 1, borderColor: colors.border,
  },
  err: { color: colors.error, marginTop: spacing.md, fontSize: 14 },

  customBox: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  customInput: {
    flex: 1, backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 12,
    fontSize: 14, borderWidth: 1, borderColor: colors.brandTertiary,
  },
  customApply: {
    backgroundColor: colors.brandPrimary, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center',
  },
  customApplyText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1 },

  batchCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.lg, marginTop: spacing.xl,
    borderWidth: 1, borderColor: colors.brandTertiary,
  },
  batchIcon: {
    width: 44, height: 44, borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center',
  },
  batchTitle: { color: colors.onSurface, fontSize: 15, fontWeight: '900' },
  batchSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },

  stickyBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: spacing.lg, paddingBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
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
  modalTitle: { color: colors.onSurface, fontSize: 18, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  modalBody: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: 'center', marginTop: spacing.sm },
  modalLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: spacing.lg, marginBottom: spacing.sm },
  countRow: { flexDirection: 'row', gap: spacing.sm },
  countPill: {
    flex: 1, backgroundColor: colors.surfaceTertiary, paddingVertical: 14,
    borderRadius: radius.pill, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  countPillActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
  countText: { color: colors.onSurface, fontSize: 16, fontWeight: '900' },
  countTextActive: { color: colors.onBrandTertiary },
});
