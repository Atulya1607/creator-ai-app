import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { colors, spacing, radius, NICHES, GOALS } from '@/src/theme';
import { useAuth } from '@/src/auth';
import { api } from '@/src/api';

export default function Onboarding() {
  const { setUser } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<0 | 1>(0);
  const [niche, setNiche] = useState<string | null>(null);
  const [goals, setGoals] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggleGoal = (g: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGoals((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  };

  const onNext = () => {
    if (!niche) {
      setErr('Pick a niche');
      return;
    }
    setErr(null);
    setStep(1);
  };

  const onFinish = async () => {
    if (!niche) return;
    setBusy(true);
    try {
      const u = await api.onboarding(niche, goals);
      setUser(u);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (e: any) {
      setErr(e.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }}>
        <Text style={styles.step}>STEP {step + 1} / 2</Text>
        <Text style={styles.h1} testID="onboarding-title">
          {step === 0 ? 'CHOOSE YOUR\nNICHE.' : "WHAT'S YOUR\nGOAL?"}
        </Text>
        <Text style={styles.sub}>
          {step === 0 ? 'Your content niche shapes every idea.' : 'Pick as many as you like.'}
        </Text>

        <View style={styles.grid}>
          {(step === 0 ? NICHES : GOALS).map((item) => {
            const active = step === 0 ? niche === item : goals.includes(item);
            return (
              <Pressable
                key={item}
                testID={`onboarding-chip-${item.toLowerCase().replace(/\s+/g, '-')}`}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (step === 0) setNiche(item);
                  else toggleGoal(item);
                }}
                style={[styles.pill, active && styles.pillActive]}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{item}</Text>
              </Pressable>
            );
          })}
        </View>

        {err && <Text style={styles.err}>{err}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        {step === 1 && (
          <Pressable
            testID="onboarding-back-button"
            onPress={() => setStep(0)}
            style={styles.back}
          >
            <Text style={styles.backText}>BACK</Text>
          </Pressable>
        )}
        <Pressable
          testID="onboarding-cta-button"
          onPress={step === 0 ? onNext : onFinish}
          disabled={busy}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <Text style={styles.ctaText}>{step === 0 ? 'NEXT' : 'LOCK IN'}</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  step: { color: colors.brandPrimary, fontSize: 12, letterSpacing: 2, fontWeight: '800' },
  h1: { color: colors.onSurface, fontSize: 44, fontWeight: '900', lineHeight: 46, letterSpacing: -1, marginTop: spacing.sm },
  sub: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xl },
  pill: {
    paddingHorizontal: spacing.lg, paddingVertical: 14,
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
  pillText: { color: colors.onSurface, fontWeight: '700', fontSize: 15 },
  pillTextActive: { color: colors.onBrandTertiary },
  err: { color: colors.error, marginTop: spacing.md, fontSize: 14 },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: spacing.lg, paddingBottom: spacing.xl,
    flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  cta: {
    flex: 1, backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    alignItems: 'center', paddingVertical: 18,
  },
  ctaText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  back: {
    paddingHorizontal: spacing.xl, paddingVertical: 18,
    borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary,
  },
  backText: { color: colors.onSurface, fontWeight: '800', letterSpacing: 1 },
});
