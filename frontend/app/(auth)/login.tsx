import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { colors, spacing, radius } from '@/src/theme';
import { useAuth } from '@/src/auth';

export default function Login() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    setErr(null);
    if (!email || !password) {
      setErr('Enter email and password');
      return;
    }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (e: any) {
      setErr(e.message || 'Login failed');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoRow}>
            <View style={styles.logoBox}>
              <Ionicons name="flash" size={28} color={colors.onBrandPrimary} />
            </View>
            <Text style={styles.brand}>CreatorAI</Text>
          </View>

          <Text style={styles.h1}>WELCOME{'\n'}BACK.</Text>
          <Text style={styles.sub}>Ship viral content. Every day.</Text>

          <View style={{ height: spacing.xxl }} />

          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            testID="login-email-input"
            value={email}
            onChangeText={setEmail}
            placeholder="you@creator.com"
            placeholderTextColor={colors.onSurfaceSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
          />

          <View style={{ height: spacing.md }} />
          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            testID="login-password-input"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.onSurfaceSecondary}
            secureTextEntry
            style={styles.input}
          />

          {err && (
            <Text testID="login-error" style={styles.err}>
              {err}
            </Text>
          )}

          <Pressable
            testID="login-submit-button"
            onPress={onSubmit}
            disabled={busy}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={styles.ctaText}>LOG IN</Text>
            )}
          </Pressable>

          <View style={styles.linkRow}>
            <Text style={styles.linkMuted}>New here?  </Text>
            <Link href="/(auth)/signup" asChild>
              <Pressable testID="go-to-signup-link">
                <Text style={styles.link}>Create account</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.xl, paddingTop: spacing.xxl },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  logoBox: {
    width: 44, height: 44, backgroundColor: colors.brandPrimary,
    borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
  },
  brand: { color: colors.onSurface, fontSize: 20, fontWeight: '800', letterSpacing: 0.4 },
  h1: { color: colors.onSurface, fontSize: 44, fontWeight: '900', lineHeight: 46, letterSpacing: -1 },
  sub: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, fontSize: 16 },
  label: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1.6, marginBottom: spacing.xs, fontWeight: '700' },
  input: {
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cta: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill,
    alignItems: 'center',
    paddingVertical: 18,
    marginTop: spacing.xl,
  },
  ctaText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  err: { color: colors.error, marginTop: spacing.md, fontSize: 14 },
  linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  linkMuted: { color: colors.onSurfaceSecondary },
  link: { color: colors.brandPrimary, fontWeight: '800' },
});
