import React from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, TextInput, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';

type TodoSearchBarProps = {
  isVisible: boolean;
  query: string;
  accentColor: string;
  inactiveColor: string;
  backgroundColor: string;
  style?: StyleProp<ViewStyle>;
  onChangeQuery: (query: string) => void;
  onToggle: () => void;
};

export function TodoSearchHeaderButton({
  isVisible,
  accentColor,
  inactiveColor,
  onToggle,
}: Pick<TodoSearchBarProps, 'isVisible' | 'accentColor' | 'inactiveColor' | 'onToggle'>) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={[
        styles.headerButton,
        isVisible && styles.headerButtonActive,
      ]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={isVisible ? 'Close todo search' : 'Search todos'}
    >
      <MaterialCommunityIcons
        name="magnify"
        size={22}
        color={isVisible ? accentColor : inactiveColor}
      />
    </TouchableOpacity>
  );
}

export function TodoSearchBar({
  isVisible,
  query,
  accentColor,
  backgroundColor,
  style,
  onChangeQuery,
}: TodoSearchBarProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <View
      style={[
        styles.bar,
        style,
        {
          borderColor: accentColor,
          backgroundColor,
        },
      ]}
    >
      <MaterialCommunityIcons name="magnify" size={18} color={accentColor} />
      <TextInput
        value={query}
        onChangeText={onChangeQuery}
        autoFocus
        placeholder="Search todos"
        placeholderTextColor="rgba(232, 255, 250, 0.52)"
        selectionColor={accentColor}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={styles.input}
      />
      {query.trim().length > 0 && (
        <TouchableOpacity
          onPress={() => onChangeQuery('')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Clear todo search"
        >
          <MaterialCommunityIcons name="close-circle" size={18} color={accentColor} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    width: 30,
    height: 30,
    marginRight: 12,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonActive: {
    backgroundColor: 'rgba(193, 255, 244, 0.16)',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 10,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    color: '#E8FFFA',
    fontSize: 14,
    paddingVertical: 11,
    paddingHorizontal: 10,
  },
});
