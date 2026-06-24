import React from 'react';
import { StyleSheet } from 'react-native';
import { Chip } from 'react-native-paper';
import type { CrowdLevel } from '../../types';

const config: Record<CrowdLevel, { label: string; icon: string; color: string }> = {
  low: { label: 'Düşük', icon: 'account-outline', color: '#34A853' },
  medium: { label: 'Orta', icon: 'account-multiple-outline', color: '#FBBC04' },
  high: { label: 'Yüksek', icon: 'account-multiple', color: '#FF6D00' },
  very_high: { label: 'Çok Yüksek', icon: 'account-group', color: '#D93025' },
};

interface Props {
  level: CrowdLevel;
}

export const CrowdBadge = React.memo(function CrowdBadge({ level }: Props) {
  const { label, icon, color } = config[level];
  return (
    <Chip
      icon={icon}
      style={[styles.chip, { backgroundColor: color + '20' }]}
      textStyle={{ color, fontSize: 12 }}
    >
      {label}
    </Chip>
  );
});

const styles = StyleSheet.create({
  chip: {
    height: 28,
    alignSelf: 'flex-start',
  },
});
