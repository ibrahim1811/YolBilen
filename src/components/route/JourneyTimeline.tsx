import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getLineColor, lineTitle, TRANSIT_MODE_ICON } from '../../data/gtfsData';
import type { RouteStep } from '../../types';

export function hhmm(mins: number): string {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export interface TimedStep { step: RouteStep; start: number; end: number; wait: number }

// Adımlar başlangıç saatinden itibaren sıralanır; araç, durağa varıştan sonra kalkış saatinde başlar.
export function buildTimeline(steps: RouteStep[], startMins?: number): { items: TimedStep[]; leaveAt: number; arriveAt: number } {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes() + (now.getHours() < 3 ? 1440 : 0);
  let t = startMins !== undefined && startMins > nowMins ? startMins : nowMins;
  const items: TimedStep[] = [];
  for (const step of steps) {
    if (step.type === 'walk') {
      items.push({ step, start: t, end: t + step.durationMins, wait: 0 });
      t += step.durationMins;
    } else {
      const dep = step.departureMins !== undefined && step.departureMins >= t ? step.departureMins : t;
      items.push({ step, start: dep, end: dep + step.durationMins, wait: dep - t });
      t = dep + step.durationMins;
    }
  }
  const firstTransit = items.find(x => x.step.type === 'transit');
  const firstWalk = items[0]?.step.type === 'walk' ? items[0] : null;
  const leaveAt = firstTransit && firstWalk ? firstTransit.start - firstWalk.step.durationMins : items[0]?.start ?? t;
  return { items, leaveAt, arriveAt: t };
}

const VEHICLE: Record<NonNullable<RouteStep['mode']>, string> = {
  bus: 'Otobüs', metro: 'Metro', tram: 'Tramvay', rail: 'İZBAN', ferry: 'Vapur',
};

interface Props {
  steps: RouteStep[];
  startMins?: number;
  originName?: string;
  destinationName?: string;
}

export function JourneyTimeline({ steps, startMins, originName, destinationName }: Props) {
  const theme = useTheme();
  const { items, leaveAt, arriveAt } = buildTimeline(steps, startMins);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const muted = theme.colors.onSurfaceVariant;
  const ink = theme.colors.onSurface;
  const line = theme.colors.outlineVariant;

  const rows: React.ReactNode[] = [];

  rows.push(
    <Stop key="start" time={hhmm(leaveAt)} dotColor={ink} hollow title={originName ?? 'Başlangıç'} />
  );

  items.forEach(({ step, start, end, wait }, i) => {
    if (step.type === 'walk') {
      if (step.durationMins <= 0) return;
      rows.push(
        <Segment key={`w${i}`} kind="walk" color={line}>
          <View style={styles.inline}>
            <MaterialCommunityIcons name="walk" size={16} color={muted} />
            <Text style={[styles.segText, { color: muted }]}>
              {step.durationMins} dk yürü{step.distanceMeters ? ` · ${step.distanceMeters} m` : ''}
            </Text>
          </View>
        </Segment>
      );
      return;
    }

    const mode = step.mode ?? 'bus';
    const color = getLineColor(step.lineNumber ?? '') ?? theme.colors.primary;
    const mids = step.intermediateStops ?? [];
    const expanded = !!open[i];

    rows.push(
      <Stop
        key={`b${i}`}
        time={hhmm(start)}
        bold
        dotColor={color}
        lineBelow={color}
        title={step.boardStop?.name ?? ''}
      >
        <View style={styles.inline}>
          <View style={[styles.lineChip, { backgroundColor: color }]}>
            <MaterialCommunityIcons name={TRANSIT_MODE_ICON[mode]} size={14} color="#FFF" />
            <Text style={styles.lineChipText} numberOfLines={1}>
              {mode === 'ferry' ? VEHICLE.ferry : step.lineNumber}
            </Text>
          </View>
          {step.headsign ? (
            <Text style={[styles.headsign, { color: ink }]} numberOfLines={1}>→ {step.headsign}</Text>
          ) : (
            <Text style={[styles.headsign, { color: ink }]} numberOfLines={1}>{lineTitle(step.lineNumber ?? '')}</Text>
          )}
        </View>
        <View style={[styles.inline, styles.metaRow]}>
          {step.isLive ? (
            <View style={styles.inline}>
              <View style={styles.liveDot} />
              <Text style={[styles.meta, { color: '#188038' }]}>Canlı</Text>
            </View>
          ) : (
            <Text style={[styles.meta, { color: muted }]}>Tarife</Text>
          )}
          {wait > 0 && <Text style={[styles.meta, { color: muted }]}> · {wait} dk bekleme</Text>}
        </View>
      </Stop>
    );

    rows.push(
      <Segment key={`r${i}`} kind="ride" color={color}>
        <TouchableOpacity
          disabled={mids.length === 0}
          onPress={() => setOpen(o => ({ ...o, [i]: !o[i] }))}
          style={styles.inline}
          hitSlop={{ top: 8, bottom: 8 }}
        >
          <Text style={[styles.segText, { color: muted }]}>
            {mids.length + 1} durak · {step.durationMins} dk
          </Text>
          {mids.length > 0 && (
            <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={muted} />
          )}
        </TouchableOpacity>
        {expanded && (
          <View style={styles.midList}>
            {mids.map((s, j) => (
              <Text key={j} style={[styles.midStop, { color: muted }]} numberOfLines={1}>{s.name}</Text>
            ))}
          </View>
        )}
      </Segment>
    );

    rows.push(
      <Stop key={`a${i}`} time={hhmm(end)} dotColor={color} lineAbove={color} title={step.alightStop?.name ?? ''}>
        <Text style={[styles.meta, { color: muted }]}>Burada in</Text>
      </Stop>
    );
  });

  rows.push(
    <Stop key="end" time={hhmm(arriveAt)} bold dotColor={theme.colors.error} title={destinationName ?? 'Varış'} last />
  );

  return <View>{rows}</View>;
}

function Stop({
  time, title, dotColor, hollow, bold, last, children, lineAbove, lineBelow,
}: {
  time: string; title: string; dotColor: string; hollow?: boolean; bold?: boolean; last?: boolean; children?: React.ReactNode;
  lineAbove?: string; lineBelow?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.time, { color: theme.colors.onSurface }, bold && styles.timeBold]}>{time}</Text>
      <View style={styles.rail}>
        {/* Araç çizgisi durak noktasının altından/üstünden kesintisiz devam eder */}
        {lineAbove && <View style={[styles.connectorTop, { backgroundColor: lineAbove }]} />}
        {lineBelow && <View style={[styles.connectorBottom, { backgroundColor: lineBelow }]} />}
        <View
          style={[
            styles.dot,
            hollow
              ? { borderColor: dotColor, backgroundColor: theme.colors.surface }
              : { borderColor: dotColor, backgroundColor: theme.colors.surface, borderWidth: 4 },
          ]}
        />
      </View>
      <View style={[styles.content, last && { paddingBottom: 0 }]}>
        <Text style={[styles.stopTitle, { color: theme.colors.onSurface }]} numberOfLines={2}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

function Segment({ kind, color, children }: { kind: 'walk' | 'ride'; color: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.timeSpacer} />
      <View style={styles.rail}>
        {kind === 'ride' ? (
          <View style={[styles.rideLine, { backgroundColor: color }]} />
        ) : (
          <View style={styles.walkDots}>
            {Array.from({ length: 5 }).map((_, i) => (
              <View key={i} style={[styles.walkDot, { backgroundColor: color }]} />
            ))}
          </View>
        )}
      </View>
      <View style={styles.segContent}>{children}</View>
    </View>
  );
}

const TIME_W = 48;
const RAIL_W = 22;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  time: { width: TIME_W, fontSize: 13, paddingTop: 1, fontVariant: ['tabular-nums'] },
  timeBold: { fontWeight: '700' },
  timeSpacer: { width: TIME_W },
  rail: { width: RAIL_W, alignItems: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, marginTop: 2 },
  connectorTop: { position: 'absolute', top: 0, height: 9, width: 6 },
  connectorBottom: { position: 'absolute', top: 9, bottom: 0, width: 6 },
  rideLine: { width: 6, flex: 1 },
  walkDots: { flex: 1, justifyContent: 'space-evenly', paddingVertical: 4 },
  walkDot: { width: 4, height: 4, borderRadius: 2 },
  content: { flex: 1, paddingLeft: 10, paddingBottom: 6, gap: 4 },
  segContent: { flex: 1, paddingLeft: 10, paddingVertical: 12, gap: 6 },
  stopTitle: { fontSize: 15, fontWeight: '600' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaRow: { gap: 0 },
  segText: { fontSize: 13 },
  meta: { fontSize: 12 },
  headsign: { fontSize: 13, fontWeight: '500', flexShrink: 1 },
  lineChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  lineChipText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#188038' },
  midList: { gap: 4, paddingTop: 2 },
  midStop: { fontSize: 12 },
});
