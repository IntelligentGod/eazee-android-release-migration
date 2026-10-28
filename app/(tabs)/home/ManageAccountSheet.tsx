import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { exchangeCodeAsync, makeRedirectUri, ResponseType } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as Linking from 'expo-linking';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import AntDesign from '@expo/vector-icons/AntDesign';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import CountryPicker, { Country, CountryCode, FlagType, getAllCountries } from 'react-native-country-picker-modal';
import Modal from 'react-native-modal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EmailAuthProvider, reauthenticateWithCredential, signOut } from 'firebase/auth';
import { auth } from '../../../firebaseConfig';
import { useAuthSession } from '../../context/AuthSessionContext';
import { useTokens } from '../../context/TokenContext';
import { router } from 'expo-router';
import ScreenHeader from '@/components/ScreenHeader';
import LiquidGlassIconButton from '@/components/LiquidGlassIconButton';
import LowerSwipeGesture from '@/components/navigation/LowerSwipeGesture';
import { GuidedTarget } from '@/components/guidance/GuidanceProvider';
import { getActiveGoogleRedirectPayload } from './googleAuthRedirect';
import { getProfileCountryStorageKey } from '@/lib/profileCountry';
import {
  getHomeAccountBackGuidanceTargetId,
  getHomeAccountGuidanceTargetId,
} from '@/lib/navigationHelp';
import {
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_OAUTH_IN_PROGRESS_STORAGE_KEY,
  GOOGLE_REDIRECT_URI,
  GOOGLE_SCOPES,
  GOOGLE_TOKEN_ENDPOINT,
} from '@/app/context/googleOAuthConfig';
import {
  AccountDeletionUnconfirmedError,
  deleteAccount,
} from '@/lib/accountDeletion';
import { getAccountDeletionReauthenticationProvider } from '@/lib/accountDeletionProviders';
import { requestGoogleCalendarDisclosure } from '@/lib/googleCalendarDisclosure';
import { PasswordInput } from './PasswordInput';
import { reauthenticateWithAppleAccount, reauthenticateWithGoogleAccount } from './socialAuth';
import ScrollViewWithBar from '@/components/ScrollViewWithBar';

type ManageAccountSheetProps = {
  bottomInset: number;
  swipeBandHeight: number;
  visible: boolean;
  initialFocusSection?: string;
  initialFocusNonce?: string;
  onBeforeClose?: () => void;
  onClose: () => void;
};

const HOME_BACKGROUND_COLORS: [string, string] = ['#F1ECCE', '#8C8268'];
const COUNTRY_PICKER_HEIGHT = Math.min(Dimensions.get('screen').height * 0.66, 560);
const COUNTRY_PICKER_TOP_OFFSET = 96;
const COUNTRY_PICKER_THEME = {
  primaryColor: '#F6F2E3',
  primaryColorVariant: 'rgba(246, 242, 227, 0.18)',
  backgroundColor: 'transparent',
  onBackgroundTextColor: '#F6F2E3',
  filterPlaceholderTextColor: 'rgba(246, 242, 227, 0.62)',
  activeOpacity: 0.72,
  itemHeight: 54,
  flagSize: 27,
};
function VisibleGuidedTarget({
  enabled,
  targetId,
  label,
  style,
  localHighlightRadius,
  localHighlightShape,
  localHighlightInset,
  children,
}: {
  enabled: boolean;
  targetId: string;
  label?: string;
  style?: any;
  localHighlightRadius?: number;
  localHighlightShape?: 'circle' | 'rect';
  localHighlightInset?: number;
  children: React.ReactNode;
}) {
  if (enabled) {
    return (
      <GuidedTarget
        targetId={targetId}
        label={label}
        style={style}
        localHighlightRadius={localHighlightRadius}
        localHighlightShape={localHighlightShape}
        localHighlightInset={localHighlightInset}
      >
        {children}
      </GuidedTarget>
    );
  }

  return <View style={style}>{children}</View>;
}

function DeleteAccountSection({
  enabled,
  isDeleting,
  onDelete,
}: {
  enabled: boolean;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  return (
    <View style={styles.dangerSection}>
      <Text style={styles.dangerTitle}>Delete Account</Text>
      <Text style={styles.dangerDescription}>
        Permanently delete your account and all Eazee data.
      </Text>
      <TouchableOpacity
        style={[styles.deleteAccountButton, (!enabled || isDeleting) && styles.disabledButton]}
        onPress={onDelete}
        activeOpacity={0.82}
        disabled={!enabled || isDeleting}
      >
        {isDeleting ? (
          <ActivityIndicator size="small" color="#FFE8E6" />
        ) : (
          <Icon name="delete-outline" size={19} color="#FFE8E6" />
        )}
        <Text style={styles.deleteAccountText}>
          {isDeleting ? 'Deleting account...' : 'Delete Account'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function PasswordConfirmationModal({
  visible,
  password,
  isDeleting,
  onChangePassword,
  onCancel,
  onDelete,
}: {
  visible: boolean;
  password: string;
  isDeleting: boolean;
  onChangePassword: (value: string) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <Modal
      isVisible={visible}
      avoidKeyboard
      onBackButtonPress={onCancel}
      onBackdropPress={onCancel}
      style={styles.passwordModal}
    >
      <View style={styles.passwordCard}>
        <Text style={styles.passwordTitle}>Confirm your password</Text>
        <Text style={styles.passwordDescription}>
          Enter your password to permanently delete your account.
        </Text>
        <PasswordInput
          value={password}
          onChangeText={onChangePassword}
          backgroundColor="#F7F3DE"
          iconColor="#4F4C3B"
        />
        <View style={styles.passwordActions}>
          <TouchableOpacity
            style={styles.passwordCancelButton}
            disabled={isDeleting}
            onPress={onCancel}
          >
            <Text style={styles.passwordCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.passwordDeleteButton, (!password || isDeleting) && styles.disabledButton]}
            disabled={!password || isDeleting}
            onPress={onDelete}
          >
            <Text style={styles.passwordDeleteText}>Delete Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function ManageAccountSheet({ bottomInset, swipeBandHeight, visible, initialFocusSection, initialFocusNonce, onBeforeClose, onClose }: ManageAccountSheetProps) {
  const { user, isLoading: isAuthLoading } = useAuthSession();
  const { setTokens, googleConnectionState, isGoogleConnectionLoading } = useTokens();

  const [isGoogleExchangeLoading, setIsGoogleExchangeLoading] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [deletionPassword, setDeletionPassword] = useState('');
  const [country, setCountry] = useState<Country | null>(null);
  const [countryCode, setCountryCode] = useState<CountryCode>('US');
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [isCountryPickerReady, setIsCountryPickerReady] = useState(false);

  const handledGoogleRedirectUrlRef = useRef<string | null>(null);
  const isClosingRef = useRef(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const profileSectionYRef = useRef(0);
  const countrySectionYRef = useRef(0);
  const googleSectionYRef = useRef(0);
  const screenAnim = useRef(new Animated.Value(0)).current;

  const [request] = Google.useAuthRequest({
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    scopes: GOOGLE_SCOPES,
    responseType: ResponseType.Code,
    redirectUri: makeRedirectUri({
      native: GOOGLE_REDIRECT_URI,
    }),
    extraParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  });

  const isGoogleRequestReady = !!request?.url;
  const isGoogleActionLoading = isGoogleExchangeLoading || !isGoogleRequestReady;

  const animateSheet = useCallback((toValue: number, onComplete?: () => void) => {
    Animated.timing(screenAnim, {
      toValue,
      duration: toValue === 1 ? 260 : 200,
      easing: toValue === 1 ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onComplete?.();
      }
    });
  }, [screenAnim]);

  useEffect(() => {
    if (!visible) {
      setCountryPickerVisible(false);
      isClosingRef.current = false;
      screenAnim.setValue(0);
      return;
    }

    isClosingRef.current = false;
    screenAnim.setValue(0);
    const frame = requestAnimationFrame(() => {
      animateSheet(1);
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [animateSheet, screenAnim, visible]);

  useEffect(() => {
    getAllCountries(FlagType.EMOJI)
      .then(() => setIsCountryPickerReady(true))
      .catch((error) => {
        console.error('Error preloading countries:', error);
        setIsCountryPickerReady(true);
      });
  }, []);

  useEffect(() => {
    let isActive = true;

    if (!user?.uid) {
      setCountry(null);
      setCountryCode('US');
      return () => {
        isActive = false;
      };
    }

    setCountry(null);
    setCountryCode('US');

    AsyncStorage.getItem(getProfileCountryStorageKey(user.uid))
      .then((storedCountry) => {
        if (!isActive) {
          return;
        }

        if (!storedCountry) {
          setCountry(null);
          setCountryCode('US');
          return;
        }

        const parsedCountry = JSON.parse(storedCountry) as Country;
        setCountry(parsedCountry);
        setCountryCode(parsedCountry.cca2);
      })
      .catch((error) => {
        console.error('Error loading country:', error);
        if (!isActive) {
          return;
        }

        setCountry(null);
        setCountryCode('US');
      });

    return () => {
      isActive = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!visible || !initialFocusSection) {
      return;
    }

    const timeout = setTimeout(() => {
      const y = initialFocusSection === 'google'
        ? googleSectionYRef.current
        : initialFocusSection === 'profile'
          ? profileSectionYRef.current
          : initialFocusSection === 'country'
            ? countrySectionYRef.current
          : 0;
      scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 10), animated: true });
    }, 280);

    return () => clearTimeout(timeout);
  }, [initialFocusNonce, initialFocusSection, visible]);

  const finishGoogleConnection = useCallback(async (returnUrl: string) => {
    if (!request) {
      return;
    }

    const redirectPayload = getActiveGoogleRedirectPayload(returnUrl, request.state);
    if (!redirectPayload) {
      return;
    }

    const { code: codeParam, error: errorParam, errorDescription } = redirectPayload;

    setIsGoogleExchangeLoading(true);

    try {
      const result = request.parseReturnUrl(returnUrl);

      if (result.type !== 'success') {
        if (errorParam === 'access_denied') {
          return;
        }

        Alert.alert(
          'Google connection failed',
          errorDescription || 'Google sign-in did not complete successfully. Please try again.'
        );
        return;
      }

      const code = typeof result.params.code === 'string' ? result.params.code : codeParam;

      if (!code || !request.clientId || !request.redirectUri || !request.codeVerifier) {
        Alert.alert('Google connection failed', 'The Google sign-in response was incomplete. Please try again.');
        return;
      }

      const tokenResult = await exchangeCodeAsync(
        {
          code,
          clientId: request.clientId,
          redirectUri: request.redirectUri,
          extraParams: {
            code_verifier: request.codeVerifier,
          },
        },
        { tokenEndpoint: GOOGLE_TOKEN_ENDPOINT }
      );

      if (!tokenResult.refreshToken || !tokenResult.accessToken) {
        Alert.alert('Google connection failed', 'Google did not return the required account tokens. Please try again.');
        return;
      }

      await setTokens(tokenResult.accessToken, tokenResult.refreshToken);
      Alert.alert('Successfully connected to Google account');
    } catch (error) {
      console.error('Error connecting Google account:', error);
      Alert.alert('Google connection failed', 'There was a problem finishing Google sign-in. Please try again.');
    } finally {
      await AsyncStorage.removeItem(GOOGLE_OAUTH_IN_PROGRESS_STORAGE_KEY);
      setIsGoogleExchangeLoading(false);
    }
  }, [request, setTokens]);

  useEffect(() => {
    if (!visible || !request?.redirectUri) {
      return;
    }

    const handleGoogleRedirect = (url: string | null) => {
      if (!url || !url.startsWith(request.redirectUri) || handledGoogleRedirectUrlRef.current === url) {
        return;
      }

      handledGoogleRedirectUrlRef.current = url;
      void finishGoogleConnection(url);
    };

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleGoogleRedirect(url);
    });

    Linking.getInitialURL()
      .then((url) => {
        handleGoogleRedirect(url);
      })
      .catch((error) => {
        console.error('Error getting initial Google redirect URL:', error);
      });

    return () => {
      subscription.remove();
    };
  }, [finishGoogleConnection, request?.redirectUri, visible]);

  const handleClose = useCallback(() => {
    if (isClosingRef.current || isDeletingAccount) {
      return;
    }

    setCountryPickerVisible(false);
    isClosingRef.current = true;
    onBeforeClose?.();
    animateSheet(0, onClose);
  }, [animateSheet, isDeletingAccount, onBeforeClose, onClose]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (countryPickerVisible) {
        setCountryPickerVisible(false);
        return true;
      }

      handleClose();
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [countryPickerVisible, handleClose, visible]);

  const handleOpenCountryPicker = useCallback(() => {
    if (isCountryPickerReady) {
      setCountryPickerVisible(true);
      return;
    }

    getAllCountries(FlagType.EMOJI)
      .catch((error) => {
        console.error('Error loading countries:', error);
      })
      .finally(() => {
        setIsCountryPickerReady(true);
        setCountryPickerVisible(true);
      });
  }, [isCountryPickerReady]);

  const handleGoogleConnect = async () => {
    if (!request?.url || isDeletingAccount) {
      return;
    }

    try {
      if (!(await requestGoogleCalendarDisclosure())) {
        return;
      }

      handledGoogleRedirectUrlRef.current = null;
      await AsyncStorage.setItem(GOOGLE_OAUTH_IN_PROGRESS_STORAGE_KEY, String(Date.now()));
      await Linking.openURL(request.url);
    } catch (error) {
      await AsyncStorage.removeItem(GOOGLE_OAUTH_IN_PROGRESS_STORAGE_KEY);
      console.error('Error connecting Google account:', error);
      Alert.alert('Google connection failed', 'There was a problem starting Google sign-in. Please try again.');
    }
  };

  const handleLogout = async () => {
    if (isDeletingAccount) {
      return;
    }

    try {
      await setTokens(null, null);
      await signOut(auth);
      handleClose();
      router.replace({ pathname: '/home/login', params: { source: 'home' } });
    } catch (error) {
      console.error('Error signing out: ', error);
    }
  };

  const performAccountDeletion = async (appleAuthorizationCode?: string) => {
    if (!user) {
      return;
    }

    setIsPasswordModalVisible(false);
    setDeletionPassword('');
    setIsDeletingAccount(true);

    let keepDeletionLocked = false;
    try {
      await deleteAccount(user, {
        appleAuthorizationCode,
      });
      router.replace('/account-deletion');
    } catch (error: any) {
      const code = String(error?.code || '');
      if (code !== 'ERR_REQUEST_CANCELED' && code !== 'SIGN_IN_CANCELLED') {
        console.error('Error deleting account:', error);
        if (
          error instanceof AccountDeletionUnconfirmedError
        ) {
          keepDeletionLocked = true;
          Alert.alert(
            'Confirm account deletion',
            error.message,
            [
              {
                text: 'Retry',
                onPress: () => {
                  router.replace('/account-deletion');
                },
              },
            ],
            { cancelable: false }
          );
        } else {
          Alert.alert(
            'Account deletion failed',
            String(error?.message || 'Your account was not deleted. Please try again.')
          );
        }
      }
    } finally {
      if (!keepDeletionLocked) {
        setIsDeletingAccount(false);
      }
    }
  };

  const reauthenticateAndDelete = async () => {
    if (!user || isDeletingAccount) {
      return;
    }

    const reauthenticationProvider = getAccountDeletionReauthenticationProvider(
      user.providerData.map((provider) => provider.providerId)
    );

    if (!reauthenticationProvider) {
      Alert.alert('Account deletion unavailable', 'This account uses an unsupported sign-in method.');
      return;
    }

    try {
      if (reauthenticationProvider === 'apple.com') {
        setIsDeletingAccount(true);
        await performAccountDeletion(await reauthenticateWithAppleAccount(user));
        return;
      }

      if (reauthenticationProvider === 'google.com') {
        setIsDeletingAccount(true);
        await reauthenticateWithGoogleAccount(user);
        await performAccountDeletion();
        return;
      }

      setDeletionPassword('');
      setIsPasswordModalVisible(true);
    } catch (error: any) {
      const code = String(error?.code || '');
      if (code !== 'ERR_REQUEST_CANCELED' && code !== 'SIGN_IN_CANCELLED') {
        Alert.alert('Could not verify account', String(error?.message || 'Please try again.'));
      }
      setIsDeletingAccount(false);
    }
  };

  const handlePasswordDeletion = async () => {
    if (!user?.email || !deletionPassword || isDeletingAccount) {
      return;
    }

    setIsDeletingAccount(true);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, deletionPassword));
      await performAccountDeletion();
    } catch (error: any) {
      Alert.alert('Could not verify account', String(error?.message || 'Check your password and try again.'));
      setIsDeletingAccount(false);
    }
  };

  const handleDeleteAccount = () => {
    if (!user || isDeletingAccount) {
      return;
    }

    Alert.alert(
      'Delete Account?',
      'This permanently deletes your Eazee account, notes, todos, chats, personalization, and reminders. Google and Apple access will be revoked. Existing Google Calendar events will remain. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            void reauthenticateAndDelete();
          },
        },
      ]
    );
  };

  const onSelectCountry = async (selectedCountry: Country) => {
    setCountry(selectedCountry);
    setCountryCode(selectedCountry.cca2);
    setCountryPickerVisible(false);

    if (!user) {
      return;
    }

    try {
      await AsyncStorage.setItem(getProfileCountryStorageKey(user.uid), JSON.stringify(selectedCountry));
    } catch (error) {
      console.error('Error saving country:', error);
      Alert.alert('Country could not be saved', 'Please try again.');
    }
  };

  const sheetTranslateY = screenAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  });

  const sheetScale = screenAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  const displayedCountry = country;
  const pickerCountryCode = displayedCountry?.cca2 || countryCode;
  const isSheetLoading = isAuthLoading || isGoogleConnectionLoading || isDeletingAccount;

  return (
    <View pointerEvents={visible ? 'auto' : 'none'} style={[styles.root, !visible && styles.hiddenRoot]}>
      <Animated.View style={[styles.background, { opacity: screenAnim }]}>
        <LinearGradient
          colors={HOME_BACKGROUND_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View pointerEvents="none" style={styles.waveLayer}>
          <Image
            source={require('../../../assets/images/wave-bg.png')}
            style={styles.waveImage}
            resizeMode="cover"
          />
        </View>
        <LinearGradient
          colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.72)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          pointerEvents="none"
          style={styles.shadowLayer}
        />
      </Animated.View>
      <View style={styles.safeArea}>
        <Animated.View
          style={[
            styles.content,
            {
              opacity: screenAnim,
              paddingBottom: bottomInset + 18,
              transform: [{ translateY: sheetTranslateY }, { scale: sheetScale }],
            },
          ]}
        >
          <ScreenHeader
            title="Manage Account"
            titleColor="#FFFFFF"
            horizontalPadding={0}
            titlePlacement="left"
            left={(
              <VisibleGuidedTarget
                enabled={visible}
                targetId={getHomeAccountBackGuidanceTargetId()}
                label="Back"
                localHighlightRadius={999}
                localHighlightInset={4}
              >
                <LiquidGlassIconButton
                  debugLabel="home:manage-account:back"
                  onPress={handleClose}
                  disabled={isDeletingAccount}
                  size={44}
                  style={styles.headerButton}
                  fallbackTint="light"
                  fallbackBackgroundColor="rgba(255, 255, 255, 0.18)"
                  fallbackBorderColor="rgba(255, 255, 255, 0.36)"
                  hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
                >
                  <Icon name="chevron-left" size={38} color="rgba(0, 0, 0, 0.52)" />
                </LiquidGlassIconButton>
              </VisibleGuidedTarget>
            )}
          />

          <VisibleGuidedTarget
            enabled={visible}
            targetId={getHomeAccountGuidanceTargetId('settings')}
            label="Home settings"
            style={styles.shell}
          >
            <ScrollViewWithBar
              ref={scrollViewRef}
              bounces={false}
              contentContainerStyle={styles.scrollContent}
            >
                <VisibleGuidedTarget enabled={visible} targetId={getHomeAccountGuidanceTargetId('profile')} label="Profile" localHighlightRadius={18} localHighlightShape="rect">
                  <View
                    style={styles.profileSection}
                    onLayout={(event) => {
                      profileSectionYRef.current = event.nativeEvent.layout.y;
                    }}
                  >
                    <Ionicons name="person-circle" size={55} color="rgba(126, 120, 72, 0.96)" style={styles.profileAvatar} />
                    <View style={styles.profileTextWrap}>
                      <Text style={styles.profileName}>{user?.displayName || 'Name'}</Text>
                      <Text style={styles.profileEmail}>{user?.email || 'No email'}</Text>
                    </View>
                  </View>
                </VisibleGuidedTarget>

                <VisibleGuidedTarget enabled={visible} targetId={getHomeAccountGuidanceTargetId('country')} label="Country settings" localHighlightRadius={22} localHighlightShape="rect">
                  <LinearGradient
                    colors={['#9D997C', '#4D4A3B']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    onLayout={(event) => {
                      countrySectionYRef.current = event.nativeEvent.layout.y;
                    }}
                    style={styles.countryCard}
                  >
                    <Text style={styles.countryText}>
                      {displayedCountry
                        ? (typeof displayedCountry.name === 'string' ? displayedCountry.name : 'Unknown Country')
                        : 'Select Country'}
                    </Text>
                    <TouchableOpacity
                      style={[styles.editButton, isAuthLoading && styles.disabledButton]}
                      onPress={handleOpenCountryPicker}
                      disabled={isAuthLoading || isDeletingAccount}
                    >
                      <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>
                  </LinearGradient>
                </VisibleGuidedTarget>

                <View style={styles.googleCardOffset}>
                  <VisibleGuidedTarget
                    enabled={visible}
                    targetId={getHomeAccountGuidanceTargetId('google')}
                    label="Google Account"
                    localHighlightRadius={30}
                    localHighlightShape="rect"
                  >
                    <View
                      style={styles.googleCard}
                      onLayout={(event) => {
                        googleSectionYRef.current = event.nativeEvent.layout.y;
                      }}
                    >
                  <View style={styles.googleCardTopRow}>
                    <View style={styles.googleTitleRow}>
                      <AntDesign name="google" size={28} color="#000000" style={styles.googleLogo} />
                      <Text style={styles.googleTitle}>Google Account</Text>
                    </View>
                    {!isSheetLoading && googleConnectionState === 'connected' && (
                      <Icon name="check-circle" size={24} color="#7A7750" />
                    )}
                  </View>
                  <View style={styles.googleDivider} />

                  {isSheetLoading ? (
                    <View style={styles.connectionRow}>
                      <Text style={styles.disconnectedText}>Checking connection...</Text>
                      <ActivityIndicator size="small" color="#4C7A5A" />
                    </View>
                  ) : googleConnectionState === 'connected' ? (
                    <View style={styles.connectionRow}>
                      <Text style={styles.connectedText}>Connected</Text>
                      {!isGoogleActionLoading ? (
                        <TouchableOpacity onPress={handleGoogleConnect}>
                          <Text style={styles.actionLink}>Reconnect</Text>
                        </TouchableOpacity>
                      ) : (
                        <ActivityIndicator size="small" color="#4C7A5A" />
                      )}
                    </View>
                  ) : googleConnectionState === 'needsReconnect' ? (
                    <View style={styles.connectionRow}>
                      <Text style={styles.warningText}>Reconnect required</Text>
                      {!isGoogleActionLoading ? (
                        <TouchableOpacity onPress={handleGoogleConnect}>
                          <Text style={styles.actionLink}>Reconnect</Text>
                        </TouchableOpacity>
                      ) : (
                        <ActivityIndicator size="small" color="#4C7A5A" />
                      )}
                    </View>
                  ) : (
                    <View style={styles.connectionRow}>
                      <Text style={styles.disconnectedText}>Not connected</Text>
                      {!isGoogleActionLoading ? (
                        <TouchableOpacity onPress={handleGoogleConnect}>
                          <Text style={styles.actionLink}>Connect</Text>
                        </TouchableOpacity>
                      ) : (
                        <ActivityIndicator size="small" color="#4C7A5A" />
                      )}
                    </View>
                  )}
                    </View>
                  </VisibleGuidedTarget>
                </View>

                <View style={styles.logoutRow}>
                  <TouchableOpacity
                    style={[styles.logoutButton, (isAuthLoading || isDeletingAccount) && styles.disabledButton]}
                    onPress={handleLogout}
                    activeOpacity={0.82}
                    disabled={isAuthLoading || isDeletingAccount}
                  >
                    <Icon name="logout" size={18} color="#FFF8F8" style={styles.logoutIcon} />
                    <Text style={styles.logoutText}>Log Out</Text>
                  </TouchableOpacity>
                </View>

                <DeleteAccountSection
                  enabled={!!user}
                  isDeleting={isDeletingAccount}
                  onDelete={handleDeleteAccount}
                />
            </ScrollViewWithBar>
          </VisibleGuidedTarget>
        </Animated.View>
      </View>
      <Modal
        isVisible={countryPickerVisible}
        avoidKeyboard={false}
        animationIn="fadeIn"
        animationOut="fadeOut"
        animationInTiming={180}
        animationOutTiming={140}
        backdropTransitionInTiming={180}
        backdropTransitionOutTiming={140}
        useNativeDriver
        useNativeDriverForBackdrop
        onBackButtonPress={() => setCountryPickerVisible(false)}
        customBackdrop={(
          <Pressable
            style={styles.countryPickerBackdrop}
            onPress={() => setCountryPickerVisible(false)}
          >
            <LinearGradient
              colors={HOME_BACKGROUND_COLORS}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View pointerEvents="none" style={styles.countryPickerBackdropWave}>
              <Image
                source={require('../../../assets/images/wave-bg.png')}
                style={styles.waveImage}
                resizeMode="cover"
              />
            </View>
            <View pointerEvents="none" style={styles.countryPickerBackdropShade} />
          </Pressable>
        )}
        statusBarTranslucent
        style={styles.countryPickerModal}
        propagateSwipe
      >
        <View
          style={styles.countryPickerSheet}
        >
          <CountryPicker
            countryCode={pickerCountryCode}
            onClose={() => setCountryPickerVisible(false)}
            onSelect={onSelectCountry}
            theme={COUNTRY_PICKER_THEME}
            withFlag
            withFilter
            withCloseButton
            withModal={false}
          />
        </View>
      </Modal>
      <PasswordConfirmationModal
        visible={isPasswordModalVisible}
        password={deletionPassword}
        isDeleting={isDeletingAccount}
        onChangePassword={setDeletionPassword}
        onCancel={() => {
          if (!isDeletingAccount) {
            setIsPasswordModalVisible(false);
          }
        }}
        onDelete={() => void handlePasswordDeletion()}
      />
      {visible && !countryPickerVisible && !isDeletingAccount && !isPasswordModalVisible && (
        <LowerSwipeGesture
          currentTab="home"
          style={[
            styles.lowerSwipeBand,
            { height: Math.min(swipeBandHeight, Math.max(bottomInset, 24)) },
          ]}
        >
          <View />
        </LowerSwipeGesture>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 120,
    elevation: 120,
  },
  lowerSwipeBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    elevation: 20,
  },
  hiddenRoot: {
    display: 'none',
  },
  background: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  waveLayer: {
    position: 'absolute',
    top: -24,
    left: -12,
    right: -12,
    bottom: -24,
    opacity: 0.1,
  },
  waveImage: {
    width: undefined,
    height: undefined,
    flex: 1,
  },
  shadowLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 260,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 14,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 0,
    marginRight: 0,
  },
  shell: {
    flex: 1,
    borderRadius: 32,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  loadingText: {
    marginTop: 12,
    color: '#413E36',
    fontSize: 15,
  },
  scrollContent: {
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 28,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  profileAvatar: {
    marginRight: 10,
  },
  profileTextWrap: {
    flex: 1,
    marginTop: -5,
  },
  profileName: {
    fontSize: 19,
    fontWeight: '700',
    color: '#FFFDF8',
  },
  profileEmail: {
    marginTop: 4,
    fontSize: 15,
    color: 'rgba(255, 247, 236, 0.95)',
  },
  countryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 58,
    borderRadius: 22,
    paddingHorizontal: 20,
  },
  countryText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#F6F2E3',
  },
  editButton: {
    minWidth: 60,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 13,
    backgroundColor: '#221F16',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: {
    color: '#C2C2C2',
    fontSize: 15,
    fontWeight: '700',
  },
  countryPickerModal: {
    justifyContent: 'flex-start',
    margin: 0,
    paddingTop: COUNTRY_PICKER_TOP_OFFSET,
    paddingHorizontal: 20,
  },
  countryPickerBackdrop: {
    flex: 1,
  },
  countryPickerBackdropWave: {
    position: 'absolute',
    top: -24,
    left: -12,
    right: -12,
    bottom: -24,
    opacity: 0.045,
  },
  countryPickerBackdropShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 11, 8, 0.28)',
  },
  countryPickerSheet: {
    height: COUNTRY_PICKER_HEIGHT,
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(42, 40, 30, 0.9)',
  },
  navigationHelpCard: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: 'rgba(255, 253, 248, 0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  navigationHelpTitle: {
    color: '#FFFDF8',
    fontSize: 16,
    fontWeight: '800',
  },
  navigationHelpSubtitle: {
    marginTop: 4,
    color: 'rgba(255, 247, 236, 0.76)',
    fontSize: 13,
    fontWeight: '600',
  },
  navigationHelpOptions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  navigationHelpOption: {
    flex: 1,
    minHeight: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  navigationHelpOptionSelected: {
    backgroundColor: 'rgba(246, 242, 227, 0.92)',
    borderColor: 'rgba(246, 242, 227, 0.98)',
  },
  navigationHelpOptionText: {
    color: '#FFFDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  navigationHelpOptionTextSelected: {
    color: '#4D4A3B',
  },
  googleCard: {
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 19,
    backgroundColor: '#E1DBB3',
  },
  googleCardOffset: {
    marginTop: 8,
  },
  googleCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  googleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  googleLogo: {
    width: 28,
    textAlign: 'center',
  },
  googleTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#545354',
  },
  googleDivider: {
    height: 1.5,
    backgroundColor: 'rgba(84, 83, 84, 0.42)',
    marginTop: 18,
    marginBottom: 18,
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 34,
  },
  connectedText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#545354',
  },
  disconnectedText: {
    fontSize: 18,
    color: '#545354',
  },
  warningText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#9B651A',
  },
  actionLink: {
    color: '#545354',
    fontSize: 18,
    fontWeight: '700',
  },
  logoutRow: {
    alignItems: 'flex-start',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  logoutIcon: {
    marginRight: 8,
  },
  logoutText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF8F8',
  },
  dangerSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
    paddingTop: 24,
  },
  dangerTitle: {
    color: '#FFE8E6',
    fontSize: 17,
    fontWeight: '800',
  },
  dangerDescription: {
    marginTop: 6,
    color: 'rgba(255, 232, 230, 0.78)',
    fontSize: 14,
    lineHeight: 20,
  },
  deleteAccountButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 112, 0.58)',
    backgroundColor: 'rgba(143, 33, 29, 0.42)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  deleteAccountText: {
    color: '#FFE8E6',
    fontSize: 15,
    fontWeight: '800',
  },
  passwordModal: {
    justifyContent: 'center',
    margin: 22,
  },
  passwordCard: {
    borderRadius: 24,
    backgroundColor: '#4D4A3B',
    padding: 20,
  },
  passwordTitle: {
    color: '#FFFDF8',
    fontSize: 20,
    fontWeight: '800',
  },
  passwordDescription: {
    marginTop: 8,
    marginBottom: 18,
    color: 'rgba(255, 247, 236, 0.78)',
    fontSize: 14,
    lineHeight: 20,
  },
  passwordActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  passwordCancelButton: {
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  passwordCancelText: {
    color: '#FFFDF8',
    fontSize: 14,
    fontWeight: '700',
  },
  passwordDeleteButton: {
    borderRadius: 13,
    backgroundColor: '#9A332E',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  passwordDeleteText: {
    color: '#FFF4F2',
    fontSize: 14,
    fontWeight: '800',
  },
});
