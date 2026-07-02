import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius } from '@/src/theme';
import { api, Content, Stats } from '@/src/api';
import { useAuth } from '@/src/auth';

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([api.stats(), api.listContent()]);
      setStats(s);
      setRecent(list.slice(0, 20));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <ScrollView
        testID="dashboard-scroll"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brandPrimary}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.hi}>Hey, {user?.name?.split(' ')[0] || 'Creator'}</Text>
            <Text style={styles.h1}>YOUR STREAK{'\n'}IS ALIVE.</Text>
          </View>
        </View>

        {/* Streak card */}
        <LinearGradient
          colors={[colors.brandTertiary, colors.surfaceTertiary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.streakCard}
        >
          <View style={styles.streakRow}>
            <View>
              <Text style={styles.streakLabel}>CURRENT STREAK</Text>
              <Text testID="streak-count" style={styles.streakNum}>
                {loading ? '—' : stats?.current_streak ?? 0}
              </Text>
              <Text style={styles.streakSub}>
                Best: {stats?.best_streak ?? 0} days
              </Text>
            </View>
            <View style={styles.streakIcon}>
              <Ionicons name="flame" size={48} color={colors.brandPrimary} />
            </View>
          </View>
          <View style={styles.weekRow}>
            {(stats?.week_counts ?? [0, 0, 0, 0, 0, 0, 0]).map((c, i) => (
              <View key={i} style={styles.dayCol}>
                <View
                  style={[
                    styles.dayBar,
                    { height: 8 + Math.min(c, 5) * 8, backgroundColor: c > 0 ? colors.brandPrimary : colors.borderStrong },
                  ]}
                />
                <Text style={styles.dayLbl}>{['M','T','W','T','F','S','S'][(new Date().getDay() + i - 6 + 7) % 7]}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        {/* Stat cards */}
        <View style={styles.statRow}>
          <StatCard label="GENERATED" value={stats?.total_generated ?? 0} icon="flash" testID="stat-generated" />
          <StatCard label="SCHEDULED" value={stats?.total_scheduled ?? 0} icon="calendar" testID="stat-scheduled" />
        </View>

        {/* Recent */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>RECENT DROPS</Text>
          {recent.length > 0 && (
            <Text style={styles.sectionCount}>{recent.length}</Text>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
        ) : recent.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="sparkles-outline" size={40} color={colors.brandPrimary} />
            <Text style={styles.emptyTitle}>No chains yet.</Text>
            <Text style={styles.emptySub}>Start your first streak with the Create tab.</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.lg }}
          >
            {recent.map((c) => (
              <Pressable
                key={c.id}
                testID={`recent-card-${c.id}`}
                onPress={() => router.push({ pathname: '/content/[id]', params: { id: c.id } })}
                style={styles.card}
              >
                <View style={styles.cardTagRow}>
                  <View style={styles.cardTag}>
                    <Text style={styles.cardTagText}>{c.niche}</Text>
                  </View>
                  <View style={styles.scorePill}>
                    <Ionicons name="flame" size={12} color={colors.brandPrimary} />
                    <Text style={styles.scoreText}>{c.viral_score}</Text>
                  </View>
                </View>
                <Text numberOfLines={3} style={styles.cardBody}>
                  {c.ideas?.[0] || c.caption}
                </Text>
                <Text style={styles.cardMeta}>
                  {c.duration} • {c.language}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </ScrollView>

      {/* Sticky CTA */}
      <View style={styles.stickyWrap} pointerEvents="box-none">
        <Pressable
          testID="dashboard-create-cta"
          onPress={() => router.push('/(tabs)/create')}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="sparkles" size={18} color={colors.onBrandPrimary} />
          <Text style={styles.ctaText}>CREATE CONTENT</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function StatCard({
  label, value, icon, testID,
}: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap; testID: string }) {
  return (
    <View testID={testID} style={styles.stat}>
      <Ionicons name={icon} size={18} color={colors.brandPrimary} />
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.lg },
  hi: { color: colors.onSurfaceSecondary, fontSize: 14, letterSpacing: 0.5 },
  h1: { color: colors.onSurface, fontSize: 34, fontWeight: '900', lineHeight: 38, letterSpacing: -0.5, marginTop: spacing.xs },
  streakCard: {
    borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.brandTertiary,
    marginTop: spacing.md,
  },
  streakRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  streakLabel: { color: colors.onBrandTertiary, fontSize: 11, letterSpacing: 1.5, fontWeight: '800' },
  streakNum: { color: colors.onSurface, fontSize: 64, fontWeight: '900', lineHeight: 68, letterSpacing: -2 },
  streakSub: { color: colors.onSurfaceSecondary, fontSize: 13 },
  streakIcon: {
    width: 72, height: 72, borderRadius: radius.pill,
    backgroundColor: 'rgba(204,255,0,0.08)', alignItems: 'center', justifyContent: 'center',
  },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, alignItems: 'flex-end' },
  dayCol: { alignItems: 'center', flex: 1, gap: 4 },
  dayBar: { width: '55%', borderRadius: 4, minHeight: 8 },
  dayLbl: { color: colors.onSurfaceSecondary, fontSize: 10, fontWeight: '700' },
  statRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  stat: {
    flex: 1, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, padding: spacing.lg, gap: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
  },
  statVal: { color: colors.onSurface, fontSize: 28, fontWeight: '900' },
  statLabel: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1.2, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.md },
  sectionTitle: { color: colors.onSurface, fontSize: 16, fontWeight: '900', letterSpacing: 1.5 },
  sectionCount: { color: colors.brandPrimary, fontSize: 14, fontWeight: '800' },
  empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { color: colors.onSurface, fontSize: 18, fontWeight: '800' },
  emptySub: { color: colors.onSurfaceSecondary, textAlign: 'center' },
  card: {
    width: 240, backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  cardTagRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTag: {
    backgroundColor: colors.brandTertiary, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.pill,
  },
  cardTagText: { color: colors.onBrandTertiary, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  scorePill: {
    flexDirection: 'row', gap: 4, alignItems: 'center',
    backgroundColor: colors.surfaceTertiary, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: radius.pill,
  },
  scoreText: { color: colors.brandPrimary, fontSize: 12, fontWeight: '800' },
  cardBody: { color: colors.onSurface, fontSize: 14, lineHeight: 20, minHeight: 60 },
  cardMeta: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: '700' },
  stickyWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 100,
    alignItems: 'center', paddingHorizontal: spacing.lg,
  },
  cta: {
    backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingVertical: 16, paddingHorizontal: 32, flexDirection: 'row',
    gap: spacing.sm, alignItems: 'center',
    shadowColor: colors.brandPrimary, shadowOpacity: 0.4,
    shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  ctaText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1, fontSize: 15 },
});
