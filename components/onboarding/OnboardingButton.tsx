import React from 'react';
import { StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type OnboardingButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

const buttonColors: [string, string] = ['#67A499', '#145146'];

export default function OnboardingButton({
  label,
  onPress,
  variant = 'primary',
  style,
  disabled = false,
}: OnboardingButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.88}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, style, disabled ? styles.disabled : null]}
    >
      <LinearGradient
        colors={buttonColors}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.gradient, styles.buttonShadow]}
      >
        <Text style={styles.label}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
  },
  disabled: {
    opacity: 0.7,
  },
  gradient: {
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#73715C',
  },
  label: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: '#FFFFFF',
  },
  buttonShadow: {
    shadowColor: '#0A4137',
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
});
