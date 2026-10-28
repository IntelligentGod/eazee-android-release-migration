import { Platform } from 'react-native';

export function getFloatingTabBarInset(bottomInset: number) {
  if (Platform.OS === 'ios') {
    const nativeTabBarHeight = 49;

    return bottomInset + nativeTabBarHeight + 6;
  }

  const tabBarBottomOffset = 10;
  const tabBarHeight = 56;

  return tabBarHeight + tabBarBottomOffset + 8;
}
