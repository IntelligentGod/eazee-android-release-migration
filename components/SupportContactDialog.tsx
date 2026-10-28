import React, { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import MIcon from '@expo/vector-icons/MaterialCommunityIcons';
import { SUPPORT_EMAIL } from '@/lib/legalLinks';

/**
 * Settings → Legal & Support → Support. Shows the support address in the gold Home style, so
 * it can be read and copied (press and hold) even on a phone with no email app, plus a button
 * that starts an email when there is one.
 */
export default function SupportContactDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [noEmailApp, setNoEmailApp] = useState(false);

  useEffect(() => {
    if (visible) setNoEmailApp(false);
  }, [visible]);

  const openEmailApp = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Eazee support')}`)
      .then(onClose)
      .catch(() => setNoEmailApp(true));
  };

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
            <Text allowFontScaling={false} style={styles.badgeEmoji}>💬</Text>
          </View>
          <Text accessibilityRole="header" style={styles.title}>Contact support</Text>
          <Text style={styles.body}>Questions, problems or ideas? Email the Eazee team and we’ll get back to you.</Text>
          <View style={styles.emailBox}>
            <Text selectable numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.email}>{SUPPORT_EMAIL}</Text>
          </View>
          <Text style={styles.hint}>
            {noEmailApp
              ? 'No email app opened on this phone. Press and hold the address to copy it, then send from any email app.'
              : 'Press and hold the address to copy it.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={openEmailApp}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <MIcon name="email-outline" size={18} color="#F4EBC4" />
            <Text style={styles.buttonText}>Open email app</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>Close</Text>
          </Pressable>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: 'rgba(46, 45, 34, 0.25)' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
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
  badgeEmoji: { fontSize: 28 },
  title: { marginTop: 14, color: '#3D3A2E', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  body: { marginTop: 8, color: '#5A5645', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  emailBox: {
    alignSelf: 'stretch',
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.75)',
    alignItems: 'center',
  },
  email: { alignSelf: 'stretch', color: '#3D3A2E', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  hint: { marginTop: 8, color: '#6B6650', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  button: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
    minHeight: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4D4A3B',
  },
  buttonText: { color: '#F4EBC4', fontSize: 16, fontWeight: '800' },
  secondaryButton: { marginTop: 10, paddingVertical: 6, paddingHorizontal: 16 },
  secondaryButtonText: { color: '#4D4A3B', fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.8 },
});
