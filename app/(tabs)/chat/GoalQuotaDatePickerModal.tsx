import React from 'react';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { CHAT_SURFACE_RADIUS } from './constants';

type GoalQuotaDatePickerModalProps = {
  visible: boolean;
  value: Date;
  minimumDate: Date;
  isConfirming: boolean;
  onChange: (event: DateTimePickerEvent, selectedDate?: Date) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export const GoalQuotaDatePickerModal = React.memo(({
  visible,
  value,
  minimumDate,
  isConfirming,
  onChange,
  onClose,
  onConfirm,
}: GoalQuotaDatePickerModalProps) => {
  if (!visible) {
    return null;
  }

  if (Platform.OS === 'android') {
    return (
      <DateTimePicker
        value={value}
        mode="date"
        display="default"
        minimumDate={minimumDate}
        onChange={onChange}
      />
    );
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>
        <LinearGradient
          colors={['#113D36', '#001814']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Pick a date</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close date picker"
            >
              <MaterialCommunityIcons name="close" size={20} color="#E8FFFA" />
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={value}
            mode="date"
            display="inline"
            minimumDate={minimumDate}
            onChange={onChange}
            accentColor="#9BE4D7"
            textColor="#E8FFFA"
            themeVariant="dark"
            style={styles.picker}
          />
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onClose}
              activeOpacity={0.82}
              disabled={isConfirming}
            >
              <Text style={styles.secondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, isConfirming && styles.disabledButton]}
              onPress={onConfirm}
              activeOpacity={0.82}
              disabled={isConfirming}
            >
              <Text style={styles.primaryText}>{isConfirming ? 'Saving...' : 'Done'}</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
});

GoalQuotaDatePickerModal.displayName = 'GoalQuotaDatePickerModal';

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: CHAT_SURFACE_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(155, 228, 215, 0.24)',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    color: '#E8FFFA',
    fontSize: 17,
    fontWeight: '800',
  },
  closeButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  picker: {
    alignSelf: 'stretch',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: 'rgba(232, 255, 250, 0.28)',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 16,
  },
  secondaryText: {
    color: '#CBEDE7',
    fontWeight: '700',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#9BE4D7',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 18,
  },
  primaryText: {
    color: '#06211D',
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.55,
  },
});
