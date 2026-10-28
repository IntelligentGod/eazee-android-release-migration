import React from 'react';
import { Platform, type NativeSyntheticEvent, type ViewProps } from 'react-native';
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

type LiquidGlassMenuOption = {
  value: string;
  label: string;
};

type NativeLiquidGlassMenuProps = ViewProps & {
  options: LiquidGlassMenuOption[];
  selectedValue: string;
  onOptionSelected?: (event: NativeSyntheticEvent<{ value: string }>) => void;
};

let NativeLiquidGlassMenu: React.ComponentType<NativeLiquidGlassMenuProps> | null = null;

if (Platform.OS === 'ios') {
  try {
    const nativeModule = requireOptionalNativeModule('ExpoLiquidGlassMenu');
    if (nativeModule) {
      NativeLiquidGlassMenu = requireNativeViewManager<NativeLiquidGlassMenuProps>(
        'ExpoLiquidGlassMenu',
        'LiquidGlassMenuView'
      );
    }
  } catch {
    NativeLiquidGlassMenu = null;
  }
}

export function isNativeLiquidGlassMenuAvailable() {
  if (!NativeLiquidGlassMenu) {
    return false;
  }

  try {
    return isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

export function LiquidGlassMenu(props: NativeLiquidGlassMenuProps) {
  if (!NativeLiquidGlassMenu) {
    return null;
  }

  return <NativeLiquidGlassMenu {...props} />;
}
