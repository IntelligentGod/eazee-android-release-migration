import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MIcon from '@expo/vector-icons/MaterialCommunityIcons';

/** Home's one-tap week planner entry; Pro-only, so it always wears the Pro badge. */
export default function FixMyLifeButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel="Fix my life. Plan my whole week with AI. Eazee Pro."
      className="mb-4 rounded-[20px]"
      style={{
        opacity: disabled ? 0.6 : 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
        elevation: 10,
      }}
    >
      <LinearGradient
        colors={['#F4EBC4', '#C9B77A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="flex-row items-center px-4 py-3 rounded-[20px] border border-white/40"
      >
        <View className="w-10 h-10 rounded-full items-center justify-center bg-white/50 border border-white/70">
          <MIcon name="auto-fix" size={22} color="#6B5B2E" />
        </View>
        <View className="flex-1 ml-3">
          <Text className="text-[17px] font-bold text-[#3D3A2E]">Fix my life</Text>
          <Text className="text-[12px] font-medium text-[#5A5645]">Plan my whole week, Mon to Sun</Text>
        </View>
        <View className="px-2 py-0.5 rounded-full bg-white/50 border border-white/70 mr-1">
          <Text className="text-[11px] font-bold text-[#6B5B2E]">Pro</Text>
        </View>
        <MIcon name="chevron-right" size={24} color="#6B5B2E" />
      </LinearGradient>
    </TouchableOpacity>
  );
}
