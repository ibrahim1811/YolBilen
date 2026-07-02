import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Portal, Modal, TextInput, Button, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { FavoriteType, Location } from '../../types';
import { MapPickerModal } from '../common/MapPickerModal';

const LOCATION_TYPES: { type: FavoriteType; icon: string; label: string; color: string }[] = [
  { type: 'home', icon: 'home', label: 'Ev', color: '#34A853' },
  { type: 'work', icon: 'briefcase', label: 'İş', color: '#1A73E8' },
  { type: 'school', icon: 'school', label: 'Okul', color: '#FBBC04' },
  { type: 'custom', icon: 'map-marker', label: 'Diğer', color: '#9C27B0' },
];

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onAdd: (type: FavoriteType, label: string, location: Location) => Promise<void>;
  disabledTypes?: FavoriteType[];
}

export function AddFavoriteModal({ visible, onDismiss, onAdd, disabledTypes = [] }: Props) {
  const theme = useTheme();
  const [step, setStep] = useState<'type' | 'location'>('type');
  const [selectedType, setSelectedType] = useState<FavoriteType | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [showMap, setShowMap] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleTypeSelect(type: FavoriteType, defaultLabel: string) {
    setSelectedType(type);
    setCustomLabel(type === 'custom' ? '' : defaultLabel);
    setStep('location');
  }

  async function handleLocationSelect(location: Location) {
    if (!selectedType) return;
    setLoading(true);
    setError(null);
    try {
      await onAdd(selectedType, customLabel, location);
      handleClose();
    } catch {
      setError('Favori eklenemedi. Tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setStep('type');
    setSelectedType(null);
    setCustomLabel('');
    setShowMap(false);
    setError(null);
    onDismiss();
  }

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={handleClose}
        contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
      >
        {step === 'type' ? (
          <>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>Favori Ekle</Text>
            <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
              Ne tür bir konum eklemek istiyorsunuz?
            </Text>
            <View style={styles.typeGrid}>
              {LOCATION_TYPES.map(({ type, icon, label, color }) => {
                const disabled = disabledTypes.includes(type);
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeCard,
                      { backgroundColor: disabled ? theme.colors.surfaceVariant : color + '15' },
                      disabled && styles.disabled,
                    ]}
                    onPress={() => !disabled && handleTypeSelect(type, label)}
                    activeOpacity={0.75}
                    disabled={disabled}
                  >
                    <MaterialCommunityIcons
                      name={icon as any}
                      size={28}
                      color={disabled ? theme.colors.onSurfaceVariant : color}
                    />
                    <Text
                      style={[
                        styles.typeLabel,
                        { color: disabled ? theme.colors.onSurfaceVariant : theme.colors.onSurface },
                      ]}
                    >
                      {label}
                    </Text>
                    {disabled && (
                      <Text style={[styles.typeAdded, { color: theme.colors.onSurfaceVariant }]}>
                        Eklendi
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            <Button mode="text" onPress={handleClose} style={styles.cancelBtn}>
              İptal
            </Button>
          </>
        ) : (
          <>
            <View style={styles.backRow}>
              <TouchableOpacity onPress={() => setStep('type')} style={styles.backBtn}>
                <MaterialCommunityIcons name="arrow-left" size={22} color={theme.colors.onSurface} />
              </TouchableOpacity>
              <Text style={[styles.title, { color: theme.colors.onSurface }]}>Konum Seç</Text>
            </View>

            {selectedType === 'custom' && (
              <TextInput
                label="Konum adı"
                value={customLabel}
                onChangeText={setCustomLabel}
                mode="outlined"
                style={styles.labelInput}
              />
            )}

            <View style={styles.locationStep}>
              <Button
                mode="contained"
                icon="map-marker"
                onPress={() => setShowMap(true)}
                loading={loading}
                style={styles.mapBtn}
              >
                Haritadan Seç
              </Button>
              {error && (
                <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
              )}
            </View>

            <MapPickerModal
              visible={showMap}
              onDismiss={() => setShowMap(false)}
              onSelect={async (lat, lng) => {
                setShowMap(false);
                await handleLocationSelect({
                  name: customLabel || selectedType || 'Konum',
                  latitude: lat,
                  longitude: lng,
                });
              }}
            />
          </>
        )}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: 20,
    borderRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 20 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  typeCard: {
    width: '46%',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    gap: 8,
  },
  disabled: { opacity: 0.5 },
  typeLabel: { fontSize: 15, fontWeight: '600' },
  typeAdded: { fontSize: 11 },
  cancelBtn: { marginTop: 4 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  backBtn: { padding: 4 },
  labelInput: { marginBottom: 12, backgroundColor: 'transparent' },
  locationStep: { alignItems: 'center', paddingVertical: 24 },
  mapBtn: { width: '100%' },
  errorText: { fontSize: 13, marginTop: 8, textAlign: 'center' },
});
