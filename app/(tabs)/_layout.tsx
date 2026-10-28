import { Tabs } from 'expo-router';
import { Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { PlatformPressable } from '@react-navigation/elements';
import React from 'react';
import { TabBarIcon } from '@/components/navigation/TabBarIcon';
import { GlassTabBarBackground } from '@/components/navigation/GlassTabBar';
import { TabBarIconMaterial } from '@/components/navigation/TaBarIconMaterial';
import SwipeableTabBar from '@/components/navigation/SwipeableTabBar';
import { Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GuidedTarget } from '@/components/guidance/GuidanceProvider';
import { getTabGuidanceTargetId, type GuidanceTab } from '@/lib/navigationHelp';
import { useTabContext } from '@/app/context/TabContext';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

const ACTIVE_BUBBLE_DURATION = 350;
const INACTIVE_BUBBLE_SCALE = 0.3;
const IOS_TAB_ICON_SIZE = 28;
const IOS_TEMPLATE_ICON_COLOR = '#FFFFFF';
const IOS_TAB_ICON_TINT = '#85837E';
const TAB_TINTS = {
  home: '#85837E',
  todo: '#258876',
  chat: '#6CE1DD',
  calendar: '#2F9FB0',
} as const;
const PRO_TAB_TINT = '#AEFFE8';
const PRO_TAB_BAR_BACKGROUND_COLORS: [string, string] = [
  'rgba(255, 255, 255, 0.16)',
  'rgba(255, 255, 255, 0.10)',
];
const IOS_TAB_ICONS = {
  chat: MaterialCommunityIcons.getImageSource('chat-outline', IOS_TAB_ICON_SIZE, IOS_TEMPLATE_ICON_COLOR),
  home: Ionicons.getImageSource('home-outline', IOS_TAB_ICON_SIZE, IOS_TEMPLATE_ICON_COLOR),
  todo: MaterialCommunityIcons.getImageSource(
    'checkbox-marked-circle-outline',
    IOS_TAB_ICON_SIZE,
    IOS_TEMPLATE_ICON_COLOR
  ),
  calendar: MaterialCommunityIcons.getImageSource('calendar-outline', IOS_TAB_ICON_SIZE, IOS_TEMPLATE_ICON_COLOR),
};
const TAB_GUIDANCE_ITEMS: { tab: GuidanceTab; label: string; offsetX?: number; offsetY?: number }[] = [
  { tab: 'chat', label: 'Chat', offsetX: 2 },
  { tab: 'home', label: 'Home', offsetX: 1.25, offsetY: 1 },
  { tab: 'todo', label: 'Todo' },
  { tab: 'calendar', label: 'Calendar', offsetX: -2.5 },
];

function iosTabOptions(
  src: (typeof IOS_TAB_ICONS)[keyof typeof IOS_TAB_ICONS],
  selectedTint: (typeof TAB_TINTS)[keyof typeof TAB_TINTS]
) {
  return {
    icon: { src },
    iconColor: IOS_TAB_ICON_TINT,
    selectedIconColor: selectedTint,
    backgroundColor: 'transparent',
    blurEffect: 'systemDefault',
    disableTransparentOnScrollEdge: true,
    shadowColor: 'transparent',
  } as React.ComponentProps<typeof NativeTabs.Trigger>['options'];
}

function AnimatedTabBarButton({
  children,
  style,
  'aria-selected': ariaSelected,
  ...props
}: BottomTabBarButtonProps) {
  const focused = Boolean(ariaSelected);
  const bubbleProgress = useDerivedValue(() =>
    withTiming(focused ? 1 : 0, {
      duration: ACTIVE_BUBBLE_DURATION,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    })
  );

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: bubbleProgress.value,
    transform: [
      {
        scaleX: interpolate(bubbleProgress.value, [0, 1], [INACTIVE_BUBBLE_SCALE, 1]),
      },
      {
        scaleY: interpolate(bubbleProgress.value, [0, 1], [INACTIVE_BUBBLE_SCALE, 1]),
      },
    ],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(bubbleProgress.value, [0, 1], [0.94, 1]) }],
  }));

  return (
    <PlatformPressable
      {...props}
      aria-selected={ariaSelected}
      android_ripple={{ color: 'rgba(0,0,0,0.15)', borderless: true, radius: 0 }}
      style={[styles.tabButton, style]}
    >
      <Animated.View pointerEvents="none" style={[styles.activeBubbleLayer, bubbleStyle]}>
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.28)', 'rgba(0, 0, 0, 0.2)']}
          start={{ x: 0, y: 0.15 }}
          end={{ x: 1, y: 0.85 }}
          style={styles.activeIconBubble}
        >
          <View style={styles.activeIconBorder} />
        </LinearGradient>
      </Animated.View>
      <Animated.View style={iconStyle}>{children}</Animated.View>
    </PlatformPressable>
  );
}

function IosTabGuidanceAnchors() {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="none"
      style={[
        styles.iosTabGuidanceAnchors,
        {
          bottom: Math.max(0, insets.bottom - 3),
        },
      ]}
    >
      {TAB_GUIDANCE_ITEMS.map((item) => (
        <View key={item.tab} pointerEvents="none" style={styles.iosTabGuidanceSlot}>
          <GuidedTarget
            targetId={getTabGuidanceTargetId(item.tab)}
            label={item.label}
            highlightMode="local"
            localHighlightRadius={999}
            style={[
              styles.iosTabGuidanceTarget,
              item.offsetX || item.offsetY
                ? { transform: [{ translateX: item.offsetX || 0 }, { translateY: item.offsetY || 0 }] }
                : null,
            ]}
          >
            <View pointerEvents="none" style={styles.iosTabGuidanceTargetInner} />
          </GuidedTarget>
        </View>
      ))}
    </View>
  );
}

function IosTabLayout() {
  return (
    <View style={styles.iosTabsRoot}>
      <NativeTabs
        backBehavior="history"
        backgroundColor="transparent"
        blurEffect="systemDefault"
        disableTransparentOnScrollEdge
        minimizeBehavior="never"
        shadowColor="transparent"
        iconColor={{
          default: IOS_TAB_ICON_TINT,
          selected: IOS_TAB_ICON_TINT,
        }}
        labelStyle={{
          default: { color: IOS_TAB_ICON_TINT, fontSize: 0 },
          selected: { color: IOS_TAB_ICON_TINT, fontSize: 0 },
        }}
      >
        <NativeTabs.Trigger name="chat" options={iosTabOptions(IOS_TAB_ICONS.chat, TAB_TINTS.chat)}>
          <NativeTabs.Trigger.TabBar
            iconColor={TAB_TINTS.chat}
            backgroundColor="transparent"
            blurEffect="systemDefault"
            disableTransparentOnScrollEdge
            shadowColor="transparent"
          />
          <Label hidden>Chat</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="home" options={iosTabOptions(IOS_TAB_ICONS.home, TAB_TINTS.home)}>
          <NativeTabs.Trigger.TabBar
            iconColor={TAB_TINTS.home}
            backgroundColor="transparent"
            blurEffect="systemDefault"
            disableTransparentOnScrollEdge
            shadowColor="transparent"
          />
          <Label hidden>Home</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="todo" options={iosTabOptions(IOS_TAB_ICONS.todo, TAB_TINTS.todo)}>
          <NativeTabs.Trigger.TabBar
            iconColor={TAB_TINTS.todo}
            backgroundColor="transparent"
            blurEffect="systemDefault"
            disableTransparentOnScrollEdge
            shadowColor="transparent"
          />
          <Label hidden>To Do</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="calendar" options={iosTabOptions(IOS_TAB_ICONS.calendar, TAB_TINTS.calendar)}>
          <NativeTabs.Trigger.TabBar
            iconColor={TAB_TINTS.calendar}
            backgroundColor="transparent"
            blurEffect="systemDefault"
            disableTransparentOnScrollEdge
            shadowColor="transparent"
          />
          <Label hidden>Calendar</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="index" hidden>
          <Label hidden>Index</Label>
        </NativeTabs.Trigger>
      </NativeTabs>
      <IosTabGuidanceAnchors />
    </View>
  );
}

function FloatingTabLayout() {
  const { tabBarTheme } = useTabContext();
  const tabBarBottomOffset = Platform.OS === 'android' ? 10 : 8;
  const tabBarHeight = 56;

  return (
    <Tabs
      initialRouteName="chat"
      backBehavior="history"
      tabBar={(props) => <SwipeableTabBar {...props} />}
      screenOptions={({ navigation }) => {
        const state = navigation.getState();
        const activeRoute = state.routes[state.index]?.name;
        const tabIconTint =
          tabBarTheme === 'pro'
            ? PRO_TAB_TINT
            :
          activeRoute === 'home'
            ? TAB_TINTS.home
            : activeRoute === 'todo'
            ? TAB_TINTS.todo
            : activeRoute === 'chat'
              ? TAB_TINTS.chat
              : activeRoute === 'calendar'
                  ? TAB_TINTS.calendar
                : 'rgba(247, 255, 254, 0.72)';
        const tabBarBackgroundColors: [string, string] =
          tabBarTheme === 'pro'
            ? PRO_TAB_BAR_BACKGROUND_COLORS
            :
          activeRoute === 'calendar'
            ? ['rgba(71, 69, 69, 0.2)', 'rgba(71, 69, 69, 0.2)']
            : ['rgba(255, 255, 255, 0.16)', 'rgba(255, 255, 255, 0.08)'];

        return {
          tabBarActiveTintColor: tabIconTint,
          tabBarInactiveTintColor: tabIconTint,
          tabBarShowLabel: false,
          headerShown: false,
          tabBarHideOnKeyboard: true,
          animation: 'none',
          freezeOnBlur: true,
          tabBarButton: ({ ref: _ref, ...props }) => <AnimatedTabBarButton {...props} />,
          tabBarIconStyle: {
            marginTop: 'auto',
            marginBottom: 'auto',
          },
          tabBarBackground: () => <GlassTabBarBackground colors={tabBarBackgroundColors} />,
          tabBarStyle: {
            position: 'absolute',
            left: 28,
            right: 28,
            bottom: tabBarBottomOffset,
            height: tabBarHeight,
            marginHorizontal: 20,
            paddingTop: 9,
            paddingBottom: 9,
            paddingHorizontal: 8,
            borderTopWidth: 0,
            borderRadius: 999,
            backgroundColor: 'transparent',
            elevation: 0,
            shadowColor: '#000000',
            shadowOpacity: 0.12,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            overflow: 'hidden',
          },
        };
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          sceneStyle: {
            backgroundColor: '#28D5D1',
          },
          tabBarIcon: ({ color }) => <TabBarIconMaterial name="chat-outline" color={color} style={styles.iconGlyph} />,
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          freezeOnBlur: false,
          sceneStyle: {
            backgroundColor: '#8C8268',
          },
          tabBarIcon: ({ color }) => <TabBarIcon name="home-outline" color={color} style={styles.iconGlyph} />,
        }}
      />
      <Tabs.Screen
        name="todo"
        options={{
          title: 'To Do',
          lazy: false,
          freezeOnBlur: false,
          sceneStyle: {
            backgroundColor: '#0E453B',
          },
          tabBarIcon: ({ color }) => (
            <TabBarIconMaterial
              name="checkbox-marked-circle-outline"
              color={color}
              style={styles.iconGlyph}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          sceneStyle: {
            backgroundColor: '#0E4048',
          },
          tabBarIcon: ({ color }) => (
            <TabBarIconMaterial name="calendar-outline" color={color} style={styles.iconGlyph} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          href: null,
          headerTitle: "Home Tab",
          title: "Home Tab Title"
        }}
      />
      <Tabs.Screen
        name="note"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="booking"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="calculator"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return Platform.OS === 'ios' ? <IosTabLayout /> : <FloatingTabLayout />;
}

const styles = StyleSheet.create({
  iosTabsRoot: {
    flex: 1,
  },
  iosTabGuidanceAnchors: {
    position: 'absolute',
    left: 28,
    right: 28,
    height: 42,
    flexDirection: 'row',
    zIndex: 1,
    elevation: 1,
  },
  iosTabGuidanceSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iosTabGuidanceTarget: {
    width: IOS_TAB_ICON_SIZE,
    height: IOS_TAB_ICON_SIZE,
  },
  iosTabGuidanceTargetInner: {
    flex: 1,
  },
  activeIconBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  activeBubbleLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIconBubble: {
    width: 68,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconGlyph: {
    transform: [{ translateY: 0 }],
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
