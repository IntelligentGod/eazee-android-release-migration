import React, { useState } from 'react';
import { TextInput, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

type PasswordInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  backgroundColor: string;
  iconColor: string;
  style?: StyleProp<ViewStyle>;
};

export function PasswordInput({
  value,
  onChangeText,
  backgroundColor,
  iconColor,
  style,
}: PasswordInputProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  return (
    <View className="h-12 flex-row items-center rounded-2xl px-4" style={[{ backgroundColor }, style]}>
      <TextInput
        className="h-full flex-1 text-black"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!isPasswordVisible}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
        accessibilityRole="button"
        className="ml-2 h-10 w-10 items-center justify-center"
        onPress={() => setIsPasswordVisible((currentValue) => !currentValue)}
      >
        <MaterialIcons name={isPasswordVisible ? 'visibility-off' : 'visibility'} size={22} color={iconColor} />
      </TouchableOpacity>
    </View>
  );
}
