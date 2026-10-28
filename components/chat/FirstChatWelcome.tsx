import React from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import {
  FIRST_CHAT_STARTERS,
  FIRST_CHAT_WELCOME_FOOTER,
  FIRST_CHAT_WELCOME_TITLE,
  type FirstChatStarter,
} from '@/lib/firstChatOnboarding';

/** Six starter buttons on every empty chat. Typing or speaking in the AI bar works just as well. */
export default function FirstChatWelcome({
  disabled,
  onSelect,
}: {
  disabled?: boolean;
  onSelect: (starter: FirstChatStarter) => void;
}) {
  const { fontScale } = useWindowDimensions();
  // Large accessibility text gets one button per row so labels are not cut off.
  const singleColumn = fontScale > 1.3;

  return (
    <View style={{ paddingHorizontal: 4, paddingTop: 8 }}>
      <Text
        accessibilityRole="header"
        style={{ marginBottom: 14, color: '#F4FFFD', fontSize: 20, lineHeight: 27, fontWeight: '800' }}
      >
        {FIRST_CHAT_WELCOME_TITLE}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
        {FIRST_CHAT_STARTERS.map((starter) => (
          <Pressable
            key={starter.intent}
            accessibilityRole="button"
            accessibilityLabel={starter.label}
            accessibilityState={{ disabled: !!disabled }}
            disabled={disabled}
            onPress={() => onSelect(starter)}
            style={({ pressed }) => ({
              width: singleColumn ? '100%' : '48.5%',
              minHeight: 64,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 18,
              borderWidth: 1.5,
              borderColor: '#32AA9D',
              backgroundColor: pressed ? 'rgba(23, 116, 112, 0.85)' : 'rgba(0, 0, 0, 0.45)',
              opacity: disabled ? 0.55 : 1,
            })}
          >
            <Text allowFontScaling={false} style={{ fontSize: 20 }}>{starter.emoji}</Text>
            <Text style={{ flex: 1, color: '#E8FFFA', fontSize: 14, lineHeight: 18, fontWeight: '700' }}>
              {starter.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={{ marginTop: 16, color: 'rgba(232, 255, 250, 0.82)', fontSize: 14, lineHeight: 19, textAlign: 'center' }}>
        {FIRST_CHAT_WELCOME_FOOTER}
      </Text>
    </View>
  );
}
