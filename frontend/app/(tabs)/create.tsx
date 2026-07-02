import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform,
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
  const [niche, setNiche] = useState<string>(user?.niche || NICHES[0]);
  const [tone, setTone] = useState<string>(TONES[0]);
  const [duration, setDuration] = useState<string>(DURATIONS[1]);
  const [language, setLanguage] = useState<string>(LANGUAGES[0]);
  const [audience, setAudience] = useState<string>('Gen-Z creators');
  const [topic, setTopic] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const generate = async () => {
    setErr(null);
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const c = await api.generate({
        niche,
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 160 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.eyebrow}>CONTENT ENGINE</Text>
          <Text style={styles.h1}>GENERATE{'\n'}A VIRAL DROP.</Text>

          <SectionLabel>NICHE</SectionLabel>
          <ChipRow items={NICHES} value={niche} onChange={setNiche} testPrefix="niche" />

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

          <SectionLabel>TOPIC (optional)</SectionLabel>
          <TextInput
            testID="create-topic-input"
            value={topic}
            onChangeText={setTopic}
            placeholder="Seed idea, e.g. 'AI tools for students'"
            placeholderTextColor={colors.onSurfaceSecondary}
            multiline
            style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
          />

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
            <Text style={[chipStyles.chipText, active && chipStyles.chipTextActive]}>
              {it}
            </Text>
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
  stickyBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: spacing.lg, paddingBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  cta: {
    backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingVertical: 18, flexDirection: 'row', gap: spacing.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1, fontSize: 15 },
});
