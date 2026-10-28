import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, Modal, Pressable, StyleSheet, Text, View, type AlertButton, type AlertOptions } from 'react-native';
import { BlurView } from 'expo-blur';
import { registerDisclosurePresenter } from '@/lib/appDisclosure';
import { PRIVACY_POLICY_URL } from '@/lib/legalLinks';

type DialogButton = { text: string; tone: 'primary' | 'secondary' | 'destructive'; onPress?: () => void };

/**
 * iOS silently refuses to present a modal while another one is on screen (e.g. a
 * sheet still animating closed), so a dialog that has not shown by then is presented again.
 * onShow only fires after the fade-in finishes (~0.7s on first show), so this must comfortably outlast it.
 */
export const DIALOG_PRESENT_RETRY_MS = 1500;
const DIALOG_REPRESENT_DELAY_MS = 50;

type Dialog = {
  title: string;
  message?: string;
  buttons: DialogButton[];
  /** Permission notices show the logo and a Privacy policy link. */
  disclosure?: boolean;
  /** Back button / tapping outside; null when the dialog must be answered. */
  onDismiss: (() => void) | null;
};

/**
 * Orders and styles Alert buttons the app's way: the main action first as the
 * filled button, other choices outlined, cancel last.
 */
export function toDialogButtons(buttons: AlertButton[] | undefined): DialogButton[] {
  const list = buttons?.length ? buttons : [{ text: 'OK' }];
  const nonCancel = list.filter((button) => button.style !== 'cancel');
  const preferred = nonCancel.find((button) => button.isPreferred) ?? nonCancel[nonCancel.length - 1];
  const toButton = (button: AlertButton): DialogButton => ({
    text: button.text || 'OK',
    tone: button.style === 'destructive' ? 'destructive' : button === preferred ? 'primary' : 'secondary',
    onPress: button.onPress ? () => button.onPress?.() : undefined,
  });
  const main = nonCancel.filter((button) => button === preferred || button.style === 'destructive');
  const others = nonCancel.filter((button) => !main.includes(button));
  const cancel = list.filter((button) => button.style === 'cancel');
  return [...main, ...others, ...cancel].map(toButton);
}

/**
 * Every dialog in the app's own style. Mounted once at the root: while mounted,
 * `Alert.alert` calls and permission notices show here instead of the system
 * alert, one after another.
 */
export default function AppDialogHost() {
  const [queue, setQueue] = useState<Dialog[]>([]);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const current = queue[0];
  const [isRepresentPending, setIsRepresentPending] = useState(false);
  const isShownRef = useRef(false);
  const visible = !!current && !isRepresentPending;

  // Without this, a dialog awaited by its caller (e.g. AI data-sharing consent) can wait forever unseen.
  useEffect(() => {
    if (isRepresentPending) {
      const timer = setTimeout(() => setIsRepresentPending(false), DIALOG_REPRESENT_DELAY_MS);
      return () => clearTimeout(timer);
    }
    if (!visible) {
      isShownRef.current = false;
      return;
    }
    if (isShownRef.current) return;
    const timer = setTimeout(() => {
      if (!isShownRef.current) setIsRepresentPending(true);
    }, DIALOG_PRESENT_RETRY_MS);
    return () => clearTimeout(timer);
  }, [visible, isRepresentPending]);

  useEffect(() => {
    const enqueue = (dialog: Dialog) => setQueue((items) => [...items, dialog]);

    const systemAlert = Alert.alert;
    Alert.alert = (title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) => {
      const dialogButtons = toDialogButtons(buttons);
      const cancelButton = buttons?.find((button) => button.style === 'cancel');
      // cancelable: false keeps a one-button dialog up until its button is pressed.
      const dismissible = options?.cancelable === false
        ? false
        : !!cancelButton || options?.cancelable === true || dialogButtons.length === 1;
      enqueue({
        title,
        message,
        buttons: dialogButtons,
        onDismiss: dismissible
          ? () => {
              if (cancelButton) cancelButton.onPress?.();
              else if (dialogButtons.length === 1) dialogButtons[0].onPress?.();
              options?.onDismiss?.();
            }
          : null,
      });
    };

    const unregisterDisclosure = registerDisclosurePresenter((request) =>
      new Promise<boolean>((resolve) => {
        enqueue({
          title: request.title,
          message: request.message,
          disclosure: true,
          buttons: [
            { text: request.confirmLabel, tone: 'primary', onPress: () => resolve(true) },
            { text: request.cancelLabel, tone: 'secondary', onPress: () => resolve(false) },
          ],
          onDismiss: () => resolve(false),
        });
      })
    );

    return () => {
      Alert.alert = systemAlert;
      unregisterDisclosure();
    };
  }, []);

  // Closed first, so a dialog opened from a button's action queues behind nothing.
  const close = (action?: () => void) => {
    setQueue((items) => items.slice(1));
    action?.();
  };

  return (
    <Modal
      visible={visible}
      onShow={() => {
        isShownRef.current = true;
      }}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (current?.onDismiss) close(current.onDismiss);
      }}
    >
      <BlurView intensity={30} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
      <Pressable
        accessibilityLabel="Close"
        disabled={!current?.onDismiss}
        onPress={() => current?.onDismiss && close(current.onDismiss)}
        style={[StyleSheet.absoluteFill, styles.dim]}
      />
      <View pointerEvents="box-none" style={styles.overlay}>
        {current && (
          <View accessibilityViewIsModal style={styles.card}>
            {current.disclosure && (
              <Image source={require('../assets/images/eazee-logo-big.png')} resizeMode="contain" style={styles.logo} />
            )}
            <Text accessibilityRole="header" style={[styles.title, current.disclosure && styles.titleBelowLogo]}>
              {current.title}
            </Text>
            {!!current.message && <Text style={styles.body}>{current.message}</Text>}

            <View style={styles.buttons}>
              {current.buttons.map((button, index) => (
                <Pressable
                  key={`${button.text}-${index}`}
                  accessibilityRole="button"
                  onPress={() => close(button.onPress)}
                  style={({ pressed }) => [
                    styles.button,
                    button.tone === 'primary' && styles.primaryButton,
                    button.tone === 'secondary' && styles.secondaryButton,
                    button.tone === 'destructive' && styles.destructiveButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={button.tone === 'primary' ? styles.primaryText : styles.buttonText}>{button.text}</Text>
                </Pressable>
              ))}
            </View>

            {/* Reading the policy keeps the question open. */}
            {current.disclosure && (
              <Pressable
                accessibilityRole="link"
                hitSlop={8}
                onPress={() => void Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}
                style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
              >
                <Text style={styles.linkText}>Privacy policy</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {
    backgroundColor: 'rgba(0, 20, 18, 0.35)',
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 18,
    paddingHorizontal: 22,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(200, 255, 251, 0.25)',
    backgroundColor: '#10403C',
  },
  logo: {
    width: 52,
    height: 52,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  titleBelowLogo: {
    marginTop: 12,
  },
  body: {
    marginTop: 10,
    color: 'rgba(214, 245, 238, 0.86)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  buttons: {
    alignSelf: 'stretch',
    marginTop: 20,
    gap: 10,
  },
  button: {
    minHeight: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#8EE9D3',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: 'rgba(200, 255, 251, 0.35)',
  },
  destructiveButton: {
    backgroundColor: '#C2574A',
  },
  primaryText: {
    color: '#0F3B36',
    fontSize: 16,
    fontWeight: '800',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  linkButton: {
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  linkText: {
    color: '#8EE9D3',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.75,
  },
});
