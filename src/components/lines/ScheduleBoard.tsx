import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, useTheme, SegmentedButtons } from 'react-native-paper';

export type ServiceDay = 'weekday' | 'saturday' | 'sunday';

const DAY_LABEL: Record<ServiceDay, string> = { weekday: 'Hafta içi', saturday: 'Cumartesi', sunday: 'Pazar' };

interface Props {
  times: number[];
  dir: 0 | 1;
  onDirChange: (d: 0 | 1) => void;
  dirLabels: [string, string];
  showDirToggle: boolean;
  day: ServiceDay;
  onDayChange: (d: ServiceDay) => void;
  isToday: boolean;
  emptyText?: string;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// Gece yarısını geçen kalkışlar (ör. 00:30 → 1470) saat sırasında sona gelir.
function normalize(times: number[]): number[] {
  return [...new Set(times.map(t => (t < 180 ? t + 1440 : t)))].sort((a, b) => a - b);
}

export function ScheduleBoard({
  times, dir, onDirChange, dirLabels, showDirToggle, day, onDayChange, isToday, emptyText,
}: Props) {
  const theme = useTheme();
  const muted = theme.colors.onSurfaceVariant;
  const ink = theme.colors.onSurface;

  const sorted = useMemo(() => normalize(times), [times]);
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes() + (now.getHours() < 3 ? 1440 : 0);
  const upcoming = isToday ? sorted.filter(t => t >= nowMins).slice(0, 3) : [];

  const byHour = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const t of sorted) {
      const h = Math.floor(t / 60);
      let arr = m.get(h);
      if (!arr) { arr = []; m.set(h, arr); }
      arr.push(t % 60);
    }
    return [...m.entries()];
  }, [sorted]);

  const currentHour = Math.floor(nowMins / 60);

  return (
    <View style={styles.root}>
      {showDirToggle && (
        <SegmentedButtons
          value={String(dir)}
          onValueChange={v => onDirChange(v === '1' ? 1 : 0)}
          density="small"
          buttons={[
            { value: '0', label: `→ ${dirLabels[0]}`, labelStyle: styles.segLabel },
            { value: '1', label: `→ ${dirLabels[1]}`, labelStyle: styles.segLabel },
          ]}
        />
      )}

      <View style={styles.days}>
        {(Object.keys(DAY_LABEL) as ServiceDay[]).map(d => {
          const active = d === day;
          return (
            <TouchableOpacity
              key={d}
              onPress={() => onDayChange(d)}
              style={[styles.day, active && { backgroundColor: theme.colors.secondaryContainer }]}
            >
              <Text style={[styles.dayText, { color: active ? theme.colors.onSecondaryContainer : muted }]}>
                {DAY_LABEL[d]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {sorted.length === 0 ? (
        <Text style={[styles.empty, { color: muted }]}>{emptyText ?? 'Bu gün için sefer yok.'}</Text>
      ) : (
        <>
          {isToday && (
            <View style={styles.nextRow}>
              {upcoming.length === 0 ? (
                <Text style={[styles.empty, { color: muted }]}>Bugün için sefer kalmadı.</Text>
              ) : (
                upcoming.map((t, i) => {
                  const diff = t - nowMins;
                  return (
                    <View key={t} style={[styles.nextItem, i === 0 && { backgroundColor: theme.colors.primaryContainer }]}>
                      <Text style={[styles.nextTime, { color: i === 0 ? theme.colors.onPrimaryContainer : ink }]}>
                        {pad(Math.floor(t / 60) % 24)}:{pad(t % 60)}
                      </Text>
                      <Text style={[styles.nextIn, { color: i === 0 ? theme.colors.onPrimaryContainer : muted }]}>
                        {diff <= 0 ? 'şimdi' : diff < 60 ? `${diff} dk` : `${Math.floor(diff / 60)} sa ${diff % 60} dk`}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          )}

          <View style={[styles.table, { borderColor: theme.colors.outlineVariant }]}>
            {byHour.map(([h, mins]) => {
              const past = isToday && h < currentHour;
              const current = isToday && h === currentHour;
              return (
                <View
                  key={h}
                  style={[
                    styles.hourRow,
                    { borderBottomColor: theme.colors.outlineVariant },
                    current && { backgroundColor: theme.colors.primaryContainer },
                  ]}
                >
                  <Text style={[styles.hour, { color: current ? theme.colors.onPrimaryContainer : ink }, past && styles.past]}>
                    {pad(h % 24)}
                  </Text>
                  <View style={styles.minutes}>
                    {mins.map((m, i) => {
                      const passed = isToday && h * 60 + m < nowMins;
                      return (
                        <Text
                          key={i}
                          style={[
                            styles.minute,
                            { color: current ? theme.colors.onPrimaryContainer : ink },
                            (past || passed) && styles.past,
                          ]}
                        >
                          {pad(m)}
                        </Text>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}
      <Text style={[styles.note, { color: muted }]}>Saatler hattın ilk durağından kalkış saatleridir.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  segLabel: { fontSize: 12 },
  days: { flexDirection: 'row', gap: 6 },
  day: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  dayText: { fontSize: 13, fontWeight: '600' },
  nextRow: { flexDirection: 'row', gap: 8 },
  nextItem: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  nextTime: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  nextIn: { fontSize: 12, marginTop: 2 },
  table: { borderTopWidth: StyleSheet.hairlineWidth },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
  },
  hour: { width: 34, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  minutes: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  minute: { fontSize: 15, fontVariant: ['tabular-nums'] },
  past: { opacity: 0.35 },
  empty: { fontSize: 13, paddingVertical: 8 },
  note: { fontSize: 11 },
});
