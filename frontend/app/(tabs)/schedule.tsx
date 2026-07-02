import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, radius } from '@/src/theme';
import { api, Content } from '@/src/api';

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function Schedule() {
  const router = useRouter();
  const [items, setItems] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api.listSchedule();
      setItems(s);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const upcoming = items.filter((c) => c.scheduled_at && new Date(c.scheduled_at).getTime() >= Date.now());
  const past = items.filter((c) => c.scheduled_at && new Date(c.scheduled_at).getTime() < Date.now());

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>YOUR PLAN</Text>
        <Text style={styles.h1}>SCHEDULE.</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color={colors.brandPrimary} />
            <Text style={styles.emptyTitle}>Nothing scheduled.</Text>
            <Text style={styles.emptySub}>Generate content and tap Schedule to plan your drops.</Text>
            <Pressable
              testID="schedule-empty-create"
              onPress={() => router.push('/(tabs)/create')}
              style={styles.emptyCta}
            >
              <Text style={styles.emptyCtaText}>CREATE FIRST DROP</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {upcoming.length > 0 && (
              <>
                <Text style={styles.section}>UPCOMING ({upcoming.length})</Text>
                {upcoming.map((c) => (
                  <ScheduleCard key={c.id} c={c} onPress={() => router.push({ pathname: '/content/[id]', params: { id: c.id } })} />
                ))}
              </>
            )}
            {past.length > 0 && (
              <>
                <Text style={styles.section}>PAST</Text>
                {past.map((c) => (
                  <ScheduleCard key={c.id} c={c} muted onPress={() => router.push({ pathname: '/content/[id]', params: { id: c.id } })} />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ScheduleCard({ c, onPress, muted }: { c: Content; onPress: () => void; muted?: boolean }) {
  return (
    <Pressable
      testID={`schedule-item-${c.id}`}
      onPress={onPress}
      style={[styles.card, muted && { opacity: 0.55 }]}
    >
      <View style={styles.cardHead}>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{c.niche}</Text>
        </View>
        <View style={styles.scorePill}>
          <Ionicons name="flame" size={12} color={colors.brandPrimary} />
          <Text style={styles.scoreText}>{c.viral_score}</Text>
        </View>
      </View>
      <Text numberOfLines={2} style={styles.cardBody}>
        {c.ideas?.[0] || c.caption}
      </Text>
      <View style={styles.timeRow}>
        <Ionicons name="calendar" size={14} color={colors.brandPrimary} />
        <Text style={styles.timeText}>{c.scheduled_at ? fmt(c.scheduled_at) : '—'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.lg, paddingBottom: 0 },
  eyebrow: { color: colors.brandPrimary, fontSize: 12, letterSpacing: 2, fontWeight: '800' },
  h1: { color: colors.onSurface, fontSize: 36, fontWeight: '900', letterSpacing: -1, marginTop: spacing.xs },
  section: {
    color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1.5, fontWeight: '800',
    marginTop: spacing.lg, marginBottom: spacing.md,
  },
  empty: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md, marginTop: spacing.xl },
  emptyTitle: { color: colors.onSurface, fontSize: 20, fontWeight: '900' },
  emptySub: { color: colors.onSurfaceSecondary, textAlign: 'center', paddingHorizontal: spacing.lg },
  emptyCta: {
    backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingVertical: 14, paddingHorizontal: 28, marginTop: spacing.md,
  },
  emptyCtaText: { color: colors.onBrandPrimary, fontWeight: '900', letterSpacing: 1 },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.lg, marginBottom: spacing.md, gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tag: {
    backgroundColor: colors.brandTertiary, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.pill,
  },
  tagText: { color: colors.onBrandTertiary, fontSize: 11, fontWeight: '800' },
  scorePill: {
    flexDirection: 'row', gap: 4, alignItems: 'center',
    backgroundColor: colors.surfaceTertiary, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: radius.pill,
  },
  scoreText: { color: colors.brandPrimary, fontSize: 12, fontWeight: '800' },
  cardBody: { color: colors.onSurface, fontSize: 15, lineHeight: 21 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  timeText: { color: colors.brandPrimary, fontSize: 13, fontWeight: '800' },
});
