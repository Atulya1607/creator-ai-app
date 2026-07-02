import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { colors, spacing, radius } from '@/src/theme';
import { useAuth } from '@/src/auth';

export default function Profile() {
  const { user, signOut } = useAuth();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        <Text style={styles.eyebrow}>YOU</Text>
        <Text style={styles.h1}>PROFILE.</Text>

        <View style={styles.card}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={32} color={colors.onBrandPrimary} />
          </View>
          <Text style={styles.name} testID="profile-name">{user?.name}</Text>
          <Text style={styles.email} testID="profile-email">{user?.email}</Text>

          <View style={styles.divider} />

          <Row label="Niche" value={user?.niche || '—'} icon="pricetag" />
          <Row label="Goals" value={(user?.goals || []).join(', ') || '—'} icon="rocket" />
          <Row
            label="Joined"
            value={user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
            icon="calendar"
          />
        </View>

        <Pressable
          testID="profile-logout-button"
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            await signOut();
          }}
          style={({ pressed }) => [styles.logout, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.error} />
          <Text style={styles.logoutText}>LOG OUT</Text>
        </Pressable>

        <Text style={styles.footer}>CreatorAI • Auto Content Engine v1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={16} color={colors.brandPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.brandPrimary, fontSize: 12, letterSpacing: 2, fontWeight: '800' },
  h1: { color: colors.onSurface, fontSize: 36, fontWeight: '900', letterSpacing: -1, marginTop: spacing.xs },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, marginTop: spacing.xl, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  avatar: {
    width: 72, height: 72, borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  name: { color: colors.onSurface, fontSize: 22, fontWeight: '900' },
  email: { color: colors.onSurfaceSecondary, fontSize: 14, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.divider, width: '100%', marginVertical: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, width: '100%', paddingVertical: spacing.md },
  rowIcon: {
    width: 36, height: 36, borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1.2, fontWeight: '700' },
  rowValue: { color: colors.onSurface, fontSize: 15, fontWeight: '600', marginTop: 2 },
  logout: {
    marginTop: spacing.xl, flexDirection: 'row', gap: spacing.sm, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.surfaceSecondary,
    paddingVertical: 16, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border,
  },
  logoutText: { color: colors.error, fontWeight: '900', letterSpacing: 1 },
  footer: { color: colors.onSurfaceSecondary, fontSize: 11, textAlign: 'center', marginTop: spacing.xl },
});
