import React, { ReactNode, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Image,
    Keyboard,
    Text,
    TextInput,
    TextInputProps,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MIcon from '@expo/vector-icons/MaterialCommunityIcons';

type AIInputSurfaceVariant = 'default' | 'home' | 'chat' | 'todo';
type ThemedSurfaceVariant = Exclude<AIInputSurfaceVariant, 'default'>;
type MicrophoneSide = 'left' | 'right';

interface AIInputBoxProps {
    textInput: string;
    isListening: boolean;
    microphoneColor: string;
    glowAnim: Animated.Value;
    placeholder?: string;
    editable?: boolean;
    showSoftInputOnFocus?: boolean;
    caretHidden?: boolean;
    showSendButton?: boolean;
    isProcessing?: boolean;
    processingLabel?: string;
    inputRef?: React.Ref<TextInput>;
    onChangeText?: (text: string) => void;
    onSubmitEditing?: () => void;
    onSendPress?: () => void;
    /** Stops the in-flight AI request. Without it, the cancel button only shows while typing. */
    onStopPress?: () => void;
    /** The AI is replying while the field stays usable, so the cancel button offers stop. */
    isResponding?: boolean;
    voicePreviewContent?: ReactNode;
    onFocus?: () => void;
    onBlur?: () => void;
    returnKeyType?: TextInputProps['returnKeyType'];
    autoCapitalize?: TextInputProps['autoCapitalize'];
    blurOnSubmit?: boolean;
    multiline?: boolean;
    minInputHeight?: number;
    maxInputHeight?: number;
    onHeightChange?: (height: number) => void;
    inputWrapper?: (children: ReactNode) => ReactNode;
    surfaceVariant?: AIInputSurfaceVariant;
    onTextInputPress: () => void;
    onMicrophonePress: () => void;
    onMicrophoneLongPress?: () => void;
    onMicrophonePressOut?: () => void;
    microphoneDelayLongPress?: number;
    microphoneWrapper?: (children: ReactNode) => ReactNode;
    inputRingLeftColor?: string;
    inputRingRightColor?: string;
    inputBgLeftColor?: string;
    inputBgColor?: string;
    inputStrokeColor?: string;
    inputStrokeTopColor?: string;
    inputStrokeBottomColor?: string;
    inputStrokeLeftColor?: string;
    inputStrokeRightColor?: string;
    inputStrokeWidth?: number;
    micBgLeftColor?: string;
    micBgColor?: string;
    micStrokeColor?: string;
    micStrokeWidth?: number;
    microphoneSide?: MicrophoneSide;
    containerStyle?: ViewStyle;
}

type GradientPair = readonly [string, string];

/** A raised pill: a lit-from-above rim around a left-to-right fill. */
interface BevelColors {
    /** Top to bottom: the lit top edge, then the shaded bottom edge. */
    rim: GradientPair;
    /** Left to right. */
    fill: GradientPair;
}

interface SurfaceTheme {
    field: BevelColors;
    microphone: BevelColors;
    logoColor: string;
    /** Send takes over the microphone button slot instead of sitting inside the field. */
    sendInMicrophoneSlot: boolean;
    textColor: string;
    placeholderTextColor: string;
    sendOuterColors: readonly [string, string, string];
    sendInnerColor: string;
    sendIconColor: string;
    sendBorderColor: string;
    lineHeight: number;
}

// Colors sampled from the PNGs these surfaces used to be drawn from.
const surfaceThemes: Record<ThemedSurfaceVariant, SurfaceTheme> = {
    home: {
        field: { rim: ['#F4F1CB', '#5E5D4B'], fill: ['#3D3C35', '#6A685E'] },
        microphone: { rim: ['#F4F1CB', '#5E5D4B'], fill: ['#6E6C63', '#4A4943'] },
        logoColor: '#EFEBCF',
        sendInMicrophoneSlot: true,
        textColor: '#F4EFCF',
        placeholderTextColor: 'rgba(244,239,207,0.64)',
        sendOuterColors: ['#6E6A46', '#D0CC95', '#FFF7BD'],
        sendInnerColor: '#3D3A33',
        sendIconColor: '#E6E0BD',
        sendBorderColor: 'rgba(255, 247, 205, 0.48)',
        lineHeight: 19,
    },
    chat: {
        field: { rim: ['#9DFFFF', '#1A4F54'], fill: ['#237C80', '#71CACE'] },
        microphone: { rim: ['#9DFFFF', '#1A4F54'], fill: ['#62B8BB', '#2F7E84'] },
        logoColor: '#AEF7E4',
        sendInMicrophoneSlot: true,
        textColor: '#E8FFFC',
        placeholderTextColor: 'rgba(232,255,252,0.6)',
        sendOuterColors: ['#1A5960', '#7DF8FD', '#D5FFFF'],
        sendInnerColor: '#215B63',
        sendIconColor: '#E9FFFB',
        sendBorderColor: 'rgba(223, 255, 255, 0.98)',
        lineHeight: 18,
    },
    todo: {
        field: { rim: ['#8FFFF0', '#1C6358'], fill: ['#2E6D61', '#39B9A1'] },
        microphone: { rim: ['#8FFFF0', '#1C6358'], fill: ['#3CB4A1', '#2E7D70'] },
        logoColor: '#C2FFEF',
        sendInMicrophoneSlot: true,
        textColor: '#E8FFF7',
        placeholderTextColor: 'rgba(232,255,247,0.6)',
        sendOuterColors: ['#175C57', '#77F2E4', '#DAFFF7'],
        sendInnerColor: '#1E645C',
        sendIconColor: '#E9FFF8',
        sendBorderColor: 'rgba(225, 255, 244, 0.98)',
        lineHeight: 18,
    },
};

const themedSurfaceLayout = {
    inputMarginLeft: 12,
    inputMarginRight: 5,
    inputHorizontalInset: 14,
    inputVerticalInset: 4,
    rimWidth: 3,
    microphoneWidth: 74,
    microphoneHeight: 45,
    microphoneMarginLeft: 5,
    microphoneMarginRight: 14,
    microphoneMarginVertical: 8,
};

function GlowRing({
    glowAnim,
    borderRadius,
}: {
    glowAnim: Animated.Value;
    borderRadius: number;
}) {
    return (
        <Animated.View
            pointerEvents="none"
            style={{
                position: 'absolute',
                top: -2,
                left: -2,
                right: -2,
                bottom: -2,
                borderRadius: borderRadius + 2,
                borderWidth: 3,
                borderColor: '#AEFFE8',
                backgroundColor: 'rgba(174, 255, 232, 0.08)',
                shadowColor: '#AEFFE8',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.55,
                shadowRadius: 9,
                elevation: 12,
                opacity: glowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.92, 0.34],
                }),
                transform: [{
                    scale: glowAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.025],
                    }),
                }],
            }}
        />
    );
}

/** Drawn at any size without stretching, unlike the bitmaps it replaces. */
function BevelBackground({ colors, borderRadius }: { colors: BevelColors; borderRadius: number }) {
    const { rimWidth } = themedSurfaceLayout;

    return (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <LinearGradient
                colors={colors.rim}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius }}
            />
            <LinearGradient
                colors={colors.fill}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{
                    position: 'absolute',
                    top: rimWidth,
                    left: rimWidth,
                    right: rimWidth,
                    bottom: rimWidth,
                    borderRadius: Math.max(borderRadius - rimWidth, 0),
                    borderWidth: 1,
                    borderColor: 'rgba(0, 0, 0, 0.22)',
                }}
            />
        </View>
    );
}

function ThemedSurface({
    colors,
    borderRadius,
    style,
    contentStyle,
    children,
}: {
    colors: BevelColors;
    borderRadius: number;
    style?: ViewStyle;
    contentStyle?: ViewStyle;
    children: ReactNode;
}) {
    return (
        <View style={style}>
            <BevelBackground colors={colors} borderRadius={borderRadius} />
            <View
                style={{
                    flex: 1,
                    marginHorizontal: themedSurfaceLayout.inputHorizontalInset,
                    marginVertical: themedSurfaceLayout.inputVerticalInset,
                }}
            >
                <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
            </View>
        </View>
    );
}

function SendButton({
    surfaceTheme,
    defaultColors,
    defaultBorderColor,
    defaultBorderWidth,
    isExpandedMultiline,
    bottomOffset,
    onPress,
    rightOffset,
}: {
    surfaceTheme?: SurfaceTheme;
    defaultColors: readonly [string, string];
    defaultBorderColor: string;
    defaultBorderWidth: number;
    isExpandedMultiline: boolean;
    bottomOffset?: number;
    onPress?: () => void;
    rightOffset?: number;
}) {
    const size = surfaceTheme ? 22 : 22;
    const radius = size / 2;

    return (
        <TouchableOpacity
            onPress={onPress}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            style={{
                position: 'absolute',
                right: rightOffset ?? (surfaceTheme ? -2 : 6),
                top: isExpandedMultiline ? undefined : '50%',
                bottom: isExpandedMultiline ? (bottomOffset ?? (surfaceTheme ? 6 : 8)) : undefined,
                marginTop: isExpandedMultiline ? 0 : -radius,
                width: size,
                height: size,
                borderRadius: radius,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                zIndex: 30,
                shadowColor: surfaceTheme ? '#041317' : '#000000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: surfaceTheme ? 0.34 : 0,
                shadowRadius: surfaceTheme ? 8 : 0,
                elevation: surfaceTheme ? 8 : 0,
            }}
        >
            {surfaceTheme ? (
                <>
                    <LinearGradient
                        colors={surfaceTheme.sendOuterColors}
                        start={{ x: 0.12, y: 0.88 }}
                        end={{ x: 0.88, y: 0.12 }}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            borderRadius: radius,
                            padding: 2,
                        }}
                    >
                        <View
                            style={{
                                flex: 1,
                                borderRadius: radius - 2,
                                backgroundColor: surfaceTheme.sendInnerColor,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <MIcon name="arrow-up-bold" size={15} color={surfaceTheme.sendIconColor} />
                        </View>
                    </LinearGradient>
                    <View
                        pointerEvents="none"
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            borderRadius: radius,
                            borderWidth: 1,
                            borderColor: surfaceTheme.sendBorderColor,
                        }}
                    />
                    <View
                        pointerEvents="none"
                        style={{
                            position: 'absolute',
                            top: 1,
                            left: 1,
                            right: 1,
                            height: radius - 1,
                            borderRadius: radius,
                            backgroundColor: 'rgba(255,255,255,0.12)',
                        }}
                    />
                </>
            ) : (
                <>
                    <LinearGradient
                        colors={defaultColors}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            borderRadius: radius,
                        }}
                    />
                    <View
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            borderRadius: radius,
                            borderWidth: defaultBorderWidth,
                            borderColor: defaultBorderColor,
                        }}
                    />
                    <MIcon name="arrow-up" size={15} color="#FFFFFF" />
                </>
            )}
        </TouchableOpacity>
    );
}

function CancelButton({
    isStopMode,
    isExpandedMultiline,
    bottomOffset,
    rightOffset,
    backgroundColor,
    onPress,
}: {
    isStopMode: boolean;
    isExpandedMultiline: boolean;
    bottomOffset: number;
    rightOffset: number;
    /** The bar's own dark tone, so the button matches the screen instead of standing out in red. */
    backgroundColor: string;
    onPress: () => void;
}) {
    const size = 22;
    const radius = size / 2;

    return (
        <TouchableOpacity
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={isStopMode ? 'Stop AI request' : 'Cancel'}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 3 }}
            style={{
                position: 'absolute',
                right: rightOffset,
                top: isExpandedMultiline ? undefined : '50%',
                bottom: isExpandedMultiline ? bottomOffset : undefined,
                marginTop: isExpandedMultiline ? 0 : -radius,
                width: size,
                height: size,
                borderRadius: radius,
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 31,
                backgroundColor,
                borderWidth: 1.5,
                borderColor: 'rgba(255, 255, 255, 0.92)',
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.25,
                shadowRadius: 3,
                elevation: 3,
            }}
        >
            <MIcon name={isStopMode ? 'stop' : 'close'} size={isStopMode ? 13 : 14} color="#FFFFFF" />
        </TouchableOpacity>
    );
}

function MicrophoneButton({
    surfaceTheme,
    glowAnim,
    isListening,
    isProcessing,
    microphoneColor,
    onPress,
    onLongPress,
    onPressOut,
    delayLongPress,
    onSendPress,
    sendMode,
    micBgLeftColor,
    micBgColor,
    micStrokeColor,
    micStrokeWidth,
    microphoneSide,
}: {
    surfaceTheme?: SurfaceTheme;
    glowAnim: Animated.Value;
    isListening: boolean;
    isProcessing: boolean;
    microphoneColor: string;
    onPress: () => void;
    onLongPress?: () => void;
    onPressOut?: () => void;
    delayLongPress?: number;
    onSendPress?: () => void;
    sendMode: boolean;
    micBgLeftColor?: string;
    micBgColor: string;
    micStrokeColor: string;
    micStrokeWidth: number;
    microphoneSide: MicrophoneSide;
}) {
    const sendTransition = useRef(new Animated.Value(sendMode ? 1 : 0)).current;

    useEffect(() => {
        Animated.timing(sendTransition, {
            toValue: sendMode ? 1 : 0,
            duration: 160,
            useNativeDriver: true,
        }).start();
    }, [sendMode, sendTransition]);

    if (surfaceTheme) {
        const microphoneRadius = themedSurfaceLayout.microphoneHeight / 2;
        const handlePress = sendMode && onSendPress ? onSendPress : onPress;

        return (
            <TouchableOpacity
                style={{
                    width: themedSurfaceLayout.microphoneWidth,
                    height: themedSurfaceLayout.microphoneHeight,
                    marginVertical: themedSurfaceLayout.microphoneMarginVertical,
                    marginLeft: microphoneSide === 'left'
                        ? themedSurfaceLayout.microphoneMarginRight
                        : themedSurfaceLayout.microphoneMarginLeft,
                    marginRight: microphoneSide === 'left'
                        ? themedSurfaceLayout.microphoneMarginLeft
                        : themedSurfaceLayout.microphoneMarginRight,
                }}
                onPress={handlePress}
                onLongPress={onLongPress}
                onPressOut={onPressOut}
                delayLongPress={delayLongPress}
                disabled={isProcessing}
            >
                {isListening ? <GlowRing glowAnim={glowAnim} borderRadius={microphoneRadius} /> : null}
                <View
                    style={{
                        flex: 1,
                        borderRadius: microphoneRadius,
                        overflow: 'hidden',
                    }}
                >
                    <BevelBackground colors={surfaceTheme.microphone} borderRadius={microphoneRadius} />
                    <Animated.View
                        pointerEvents="none"
                        style={{
                            flex: 1,
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: sendTransition.interpolate({
                                inputRange: [0, 1],
                                outputRange: [isProcessing ? 0.6 : 1, 0],
                            }),
                            transform: [{
                                scale: sendTransition.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [1, 0.96],
                                }),
                            }],
                        }}
                    >
                        <Image
                            source={require('../assets/images/ez-logo.png')}
                            style={{
                                width: 32,
                                height: 32,
                                tintColor: isListening ? microphoneColor : surfaceTheme.logoColor,
                            }}
                            resizeMode="contain"
                        />
                    </Animated.View>
                    {surfaceTheme.sendInMicrophoneSlot ? (
                        <Animated.View
                            pointerEvents="none"
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: sendTransition,
                                transform: [{
                                    scale: sendTransition.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [0.96, 1],
                                    }),
                                }],
                            }}
                        >
                            <MIcon name="arrow-up-bold" size={26} color={surfaceTheme.logoColor} />
                        </Animated.View>
                    ) : null}
                </View>
            </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity
            style={{
                backgroundColor: 'transparent',
                borderRadius: 23.5,
                width: 72,
                height: 47,
                alignItems: 'center',
                justifyContent: 'center',
                margin: 10,
                borderColor: micStrokeColor,
                borderWidth: micStrokeWidth,
                overflow: 'visible',
            }}
            onPress={sendMode && onSendPress ? onSendPress : onPress}
            onLongPress={onLongPress}
            onPressOut={onPressOut}
            delayLongPress={delayLongPress}
            disabled={isProcessing}
        >
            {isListening ? <GlowRing glowAnim={glowAnim} borderRadius={23.5} /> : null}
            <LinearGradient
                colors={[micBgLeftColor ?? micBgColor, micBgColor]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    borderRadius: 23.5,
                }}
            />
            <View
                style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isProcessing ? 0.6 : 1,
                    shadowColor: '#000000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.35,
                    shadowRadius: 4,
                    elevation: 4,
                }}
            >
                <Animated.View style={{ opacity: sendTransition.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>
                    <Image
                        source={require('../assets/images/ez-logo.png')}
                        style={{
                            width: 35,
                            height: 35,
                            tintColor: isListening ? microphoneColor : '#D5D3B9',
                        }}
                        resizeMode="contain"
                    />
                </Animated.View>
                <Animated.View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: sendTransition,
                    }}
                >
                    <MIcon name="arrow-up-bold" size={26} color="#D5D3B9" />
                </Animated.View>
            </View>
        </TouchableOpacity>
    );
}

const AIInputBox: React.FC<AIInputBoxProps> = ({
    textInput,
    isListening,
    microphoneColor,
    glowAnim,
    placeholder,
    editable = false,
    showSoftInputOnFocus = editable,
    caretHidden = false,
    showSendButton,
    isProcessing = false,
    processingLabel = 'Processing...',
    inputRef,
    onChangeText,
    onSubmitEditing,
    onSendPress,
    onStopPress,
    isResponding = false,
    voicePreviewContent,
    onFocus,
    onBlur,
    returnKeyType = 'done',
    autoCapitalize = 'sentences',
    blurOnSubmit,
    multiline = false,
    minInputHeight = 38,
    maxInputHeight = 120,
    onHeightChange,
    inputWrapper,
    surfaceVariant = 'default',
    onTextInputPress,
    onMicrophonePress,
    onMicrophoneLongPress,
    onMicrophonePressOut,
    microphoneDelayLongPress,
    microphoneWrapper,
    inputStrokeColor = '#000000',
    inputRingLeftColor = '#000000',
    inputRingRightColor = inputStrokeColor,
    inputBgLeftColor,
    inputBgColor = '#000000',
    inputStrokeTopColor,
    inputStrokeBottomColor,
    inputStrokeLeftColor,
    inputStrokeRightColor,
    inputStrokeWidth = 4,
    micBgLeftColor,
    micBgColor = 'transparent',
    micStrokeColor = 'transparent',
    micStrokeWidth = 0,
    microphoneSide = 'right',
    containerStyle,
}) => {
    const [inputHeight, setInputHeight] = useState(minInputHeight);
    const [localTextInput, setLocalTextInput] = useState(textInput);
    const [isInputFocused, setIsInputFocused] = useState(false);
    // The text field unmounts while processing, so its blur event never arrives.
    if (isProcessing && isInputFocused) {
        setIsInputFocused(false);
    }
    const reportedHeightRef = useRef(0);
    const contentHeightRef = useRef(minInputHeight);
    const surfaceTheme = surfaceVariant === 'default' ? undefined : surfaceThemes[surfaceVariant];
    const usesThemedSurface = !!surfaceTheme;
    const themedInputHeight =
        usesThemedSurface
            ? Math.max(minInputHeight - (surfaceVariant === 'home' ? 2 : 3), 0)
            : minInputHeight;
    const fieldHeight = usesThemedSurface
        ? themedInputHeight
        : multiline
          ? Math.min(Math.max(inputHeight, minInputHeight), maxInputHeight)
          : minInputHeight;
    const innerInputHeight = multiline ? fieldHeight : minInputHeight;
    const outerInputHeight = usesThemedSurface ? innerInputHeight : innerInputHeight + 4;
    const isExpandedMultiline = multiline && fieldHeight > minInputHeight;
    const fieldBorderRadius = multiline ? (usesThemedSurface ? 22 : 18) : 9999;
    const inputPaddingLeft = usesThemedSurface ? 2 : 10;
    const hasVoicePreviewContent = !!voicePreviewContent;
    const showsSendButton =
        !isProcessing &&
        !!onSendPress &&
        (
            (localTextInput.trim().length > 0 && (showSendButton ?? editable)) ||
            (hasVoicePreviewContent && showSendButton === true)
        );
    // The Eazee button is the send button; the small inline arrow is only for a themed
    // surface that opts out.
    const showsSendInMicrophoneSlot = showsSendButton && (surfaceTheme ? surfaceTheme.sendInMicrophoneSlot : true);
    const showsInlineSendButton = showsSendButton && !showsSendInMicrophoneSlot;
    const isStopMode = !!onStopPress && (isProcessing || isResponding);
    const showsCancelButton = isStopMode || (
        !isProcessing &&
        editable &&
        !isListening &&
        !hasVoicePreviewContent &&
        (isInputFocused || localTextInput.trim().length > 0)
    );
    const cancelButtonSpace = showsCancelButton ? 28 : 0;
    const inputPaddingRight =
        (showsInlineSendButton ? (usesThemedSurface ? 18 : 44) : (usesThemedSurface ? 2 : 10)) +
        (usesThemedSurface ? 0 : cancelButtonSpace);
    const inputPaddingVertical = multiline ? (usesThemedSurface ? 2 : 9) : 0;
    const inputTextColor = surfaceTheme?.textColor ?? '#FFFFFF';
    const placeholderTextColor = surfaceTheme?.placeholderTextColor ?? '#FFFFFF';
    const lineHeight = surfaceTheme?.lineHeight ?? 18;
    const scrollsInternally = multiline && (usesThemedSurface || fieldHeight >= maxInputHeight);
    const showsProcessingState = isProcessing;
    const defaultSendButtonColors = [inputBgLeftColor ?? inputRingLeftColor, inputBgColor] as const;
    const defaultSendBorderColor =
        inputStrokeTopColor ??
        inputStrokeLeftColor ??
        (inputStrokeColor !== '#000000' ? inputStrokeColor : inputRingLeftColor);
    const defaultSendBorderWidth = defaultSendBorderColor === 'transparent' ? 0 : 1;
    const themedInputMarginLeft = microphoneSide === 'left'
        ? themedSurfaceLayout.inputMarginRight
        : themedSurfaceLayout.inputMarginLeft;
    const themedInputMarginRight = microphoneSide === 'left'
        ? themedSurfaceLayout.inputMarginLeft
        : themedSurfaceLayout.inputMarginRight;

    useEffect(() => {
        setLocalTextInput(textInput);
    }, [textInput]);

    useEffect(() => {
        if (!multiline || localTextInput) return;
        if (contentHeightRef.current !== minInputHeight) {
            contentHeightRef.current = minInputHeight;
            setInputHeight(minInputHeight);
        }
    }, [localTextInput, minInputHeight, multiline]);

    useEffect(() => {
        if (!onHeightChange) return;
        if (reportedHeightRef.current === outerInputHeight) return;
        reportedHeightRef.current = outerInputHeight;
        onHeightChange(outerInputHeight);
    }, [onHeightChange, outerInputHeight]);

    const handleCancelPress = () => {
        if (isStopMode) {
            onStopPress?.();
            return;
        }
        setLocalTextInput('');
        onChangeText?.('');
        Keyboard.dismiss();
    };

    const sendButton = showsInlineSendButton ? (
        <SendButton
            surfaceTheme={surfaceTheme}
            defaultColors={defaultSendButtonColors}
            defaultBorderColor={surfaceTheme?.sendBorderColor ?? defaultSendBorderColor}
            defaultBorderWidth={defaultSendBorderWidth}
            isExpandedMultiline={isExpandedMultiline}
            onPress={onSendPress}
        />
    ) : null;

    const cancelButton = showsCancelButton ? (
        <CancelButton
            isStopMode={isStopMode}
            isExpandedMultiline={isExpandedMultiline}
            bottomOffset={usesThemedSurface ? 10 : 8}
            rightOffset={showsInlineSendButton ? 34 : (usesThemedSurface ? 10 : 6)}
            backgroundColor={surfaceTheme?.sendInnerColor ?? '#215B63'}
            onPress={handleCancelPress}
        />
    ) : null;

    const inputContent = hasVoicePreviewContent ? (
        <View
            style={{
                flex: 1,
                minWidth: 0,
                paddingLeft: inputPaddingLeft,
                paddingRight: inputPaddingRight,
                justifyContent: 'center',
                overflow: 'hidden',
            }}
        >
            {voicePreviewContent}
        </View>
    ) : showsProcessingState ? (
        <View
            style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                paddingLeft: inputPaddingLeft,
                paddingRight: inputPaddingRight,
                gap: 8,
            }}
        >
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text
                style={{
                    fontSize: usesThemedSurface ? 13 : 12,
                    lineHeight,
                    color: inputTextColor,
                }}
            >
                {processingLabel}
            </Text>
        </View>
    ) : (
        <TextInput
            ref={inputRef}
            style={{
                flex: 1,
                fontSize: usesThemedSurface ? 13 : 12,
                lineHeight,
                color: inputTextColor,
                paddingLeft: inputPaddingLeft,
                paddingRight: inputPaddingRight,
                paddingTop: inputPaddingVertical,
                paddingBottom: inputPaddingVertical,
                textAlignVertical: multiline ? 'top' : 'center',
            }}
            value={localTextInput}
            placeholder={placeholder}
            placeholderTextColor={placeholderTextColor}
            editable={editable}
            showSoftInputOnFocus={showSoftInputOnFocus}
            caretHidden={caretHidden}
            multiline={multiline}
            scrollEnabled={scrollsInternally}
            onPressIn={onTextInputPress}
            onChangeText={(nextText) => {
                setLocalTextInput(nextText);
                onChangeText?.(nextText);
            }}
            onSubmitEditing={onSubmitEditing}
            onContentSizeChange={(event) => {
                if (!multiline || usesThemedSurface) return;
                const nextHeight = Math.min(Math.max(event.nativeEvent.contentSize.height, minInputHeight), maxInputHeight);
                if (contentHeightRef.current === nextHeight) return;
                contentHeightRef.current = nextHeight;
                setInputHeight(nextHeight);
            }}
            onFocus={() => {
                setIsInputFocused(true);
                onFocus?.();
            }}
            onBlur={() => {
                setIsInputFocused(false);
                onBlur?.();
            }}
            returnKeyType={returnKeyType}
            autoCapitalize={autoCapitalize}
            autoCorrect={!isListening}
            blurOnSubmit={blurOnSubmit}
        />
    );

    const defaultInput = inputStrokeTopColor || inputStrokeBottomColor || inputStrokeLeftColor || inputStrokeRightColor ? (
        <View
            style={{
                height: innerInputHeight,
                borderRadius: fieldBorderRadius,
                marginRight: 10,
                marginLeft: 10,
                borderWidth: inputStrokeWidth,
                borderTopColor: inputStrokeTopColor ?? inputStrokeColor,
                borderBottomColor: inputStrokeBottomColor ?? inputStrokeColor,
                borderLeftColor: inputStrokeLeftColor ?? inputStrokeColor,
                borderRightColor: inputStrokeRightColor ?? inputStrokeColor,
                overflow: 'hidden',
            }}
        >
            <LinearGradient
                colors={[inputBgLeftColor ?? inputRingLeftColor, inputBgColor]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{
                    flex: 1,
                    borderRadius: fieldBorderRadius,
                    justifyContent: multiline ? 'flex-start' : 'center',
                }}
            >
                {inputContent}
                {sendButton}
                {cancelButton}
            </LinearGradient>
        </View>
    ) : (
        <LinearGradient
            colors={[inputRingLeftColor, inputRingRightColor]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{
                height: innerInputHeight,
                borderRadius: fieldBorderRadius,
                marginRight: 10,
                marginLeft: 10,
                padding: inputStrokeWidth,
            }}
        >
            <LinearGradient
                colors={[inputBgLeftColor ?? inputRingLeftColor, inputBgColor]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{
                    flex: 1,
                    borderRadius: fieldBorderRadius,
                    justifyContent: multiline ? 'flex-start' : 'center',
                }}
            >
                {inputContent}
                {sendButton}
                {cancelButton}
            </LinearGradient>
        </LinearGradient>
    );

    const themedInput = surfaceTheme ? (
        <View
            style={{
                height: innerInputHeight,
                marginRight: themedInputMarginRight,
                marginLeft: themedInputMarginLeft,
                position: 'relative',
                overflow: 'visible',
            }}
        >
            <ThemedSurface
                colors={surfaceTheme.field}
                borderRadius={innerInputHeight / 2}
                style={{ flex: 1 }}
                contentStyle={{
                    justifyContent: multiline ? 'flex-start' : 'center',
                    marginRight: (showsInlineSendButton ? 26 : 0) + cancelButtonSpace,
                }}
            >
                {inputContent}
            </ThemedSurface>
            {cancelButton}
            {showsInlineSendButton ? (
                <SendButton
                    surfaceTheme={surfaceTheme}
                    defaultColors={defaultSendButtonColors}
                    defaultBorderColor={surfaceTheme.sendBorderColor}
                    defaultBorderWidth={defaultSendBorderWidth}
                    isExpandedMultiline={isExpandedMultiline}
                    bottomOffset={10}
                    onPress={onSendPress}
                    rightOffset={6}
                />
            ) : null}
        </View>
    ) : null;

    const inputNode = (
        <View style={{ flex: 1, justifyContent: 'center', height: outerInputHeight }}>
            {surfaceTheme ? themedInput : defaultInput}
        </View>
    );
    const wrappedInputNode = inputWrapper ? inputWrapper(inputNode) : inputNode;
    const microphoneNode = (
        <MicrophoneButton
            surfaceTheme={surfaceTheme}
            glowAnim={glowAnim}
            isListening={isListening}
            isProcessing={isProcessing}
            microphoneColor={microphoneColor}
            onPress={onMicrophonePress}
            onLongPress={onMicrophoneLongPress}
            onPressOut={onMicrophonePressOut}
            delayLongPress={microphoneDelayLongPress}
            onSendPress={onSendPress}
            sendMode={showsSendInMicrophoneSlot}
            micBgLeftColor={micBgLeftColor}
            micBgColor={micBgColor}
            micStrokeColor={micStrokeColor}
            micStrokeWidth={micStrokeWidth}
            microphoneSide={microphoneSide}
        />
    );
    const wrappedMicrophoneNode = microphoneWrapper ? microphoneWrapper(microphoneNode) : microphoneNode;

    return (
        <View
            style={[
                {
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 10,
                    backgroundColor: 'transparent',
                },
                containerStyle,
            ]}
        >
            {microphoneSide === 'left' ? wrappedMicrophoneNode : wrappedInputNode}
            {microphoneSide === 'left' ? wrappedInputNode : wrappedMicrophoneNode}
        </View>
    );
};

export default AIInputBox;
