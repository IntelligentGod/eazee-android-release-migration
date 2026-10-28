import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import MIcon from '@expo/vector-icons/MaterialCommunityIcons';

/**
 * Tells a free user a feature needs Eazee Pro, in the gold Home style, with a way to upgrade
 * (Upgrade to Pro opens the paywall) or carry on (Not now).
 */
export default function ProRequiredDialog({
  visible,
  title = 'This is an Eazee Pro feature',
  message,
  onUpgrade,
  onClose,
}: {
  visible: boolean;
  title?: string;
  message: string;
  onUpgrade?: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <BlurView intensity={30} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
      <Pressable accessibilityLabel="Close" onPress={onClose} style={[StyleSheet.absoluteFill, styles.dim]} />
      <View pointerEvents="box-none" style={styles.overlay}>
        <LinearGradient
          accessibilityViewIsModal
          colors={['#F4EBC4', '#C9B77A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.badge}>
            <MIcon name="crown-outline" size={28} color="#6B5B2E" />
          </View>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.body}>{message}</Text>
          {onUpgrade ? (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  onUpgrade();
                }}
                style={({ pressed }) => [styles.button, styles.upgradeButton, pressed && styles.pressed]}
              >
                <MIcon name="crown-outline" size={18} color="#F4EBC4" />
                <Text style={styles.buttonText}>Upgrade to Pro</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                hitSlop={8}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryButtonText}>Not now</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            >
              <Text style={styles.buttonText}>OK</Text>
            </Pressable>
          )}
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {
    backgroundColor: 'rgba(46, 45, 34, 0.25)',
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 18,
    paddingHorizontal: 22,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  title: {
    marginTop: 14,
    color: '#3D3A2E',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  body: {
    marginTop: 8,
    color: '#5A5645',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  button: {
    alignSelf: 'stretch',
    marginTop: 20,
    minHeight: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4D4A3B',
  },
  upgradeButton: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: '#4D4A3B',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonText: {
    color: '#F4EBC4',
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.8,
  },
});
