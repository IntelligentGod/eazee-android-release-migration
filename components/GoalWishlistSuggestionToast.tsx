import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { GoalWishlistSuggestion } from '@/lib/goalWishlistSuggestions';

type GoalWishlistSuggestionToastProps = {
  goalTitle: string;
  suggestions: GoalWishlistSuggestion[];
  selectedItemNames: Set<string>;
  isAdding: boolean;
  isAdded: boolean;
  bottom: number;
  showBackdrop?: boolean;
  zIndex?: number;
  onToggleItem: (itemName: string) => void;
  onAddSelected: () => void;
  onDismiss: () => void;
};

export default function GoalWishlistSuggestionToast({
  goalTitle,
  suggestions,
  selectedItemNames,
  isAdding,
  isAdded,
  bottom,
  showBackdrop = false,
  zIndex = 80,
  onToggleItem,
  onAddSelected,
  onDismiss,
}: GoalWishlistSuggestionToastProps) {
  const appearAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    appearAnim.setValue(0);
    Animated.timing(appearAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [appearAnim]);

  if (!suggestions.length) {
    return null;
  }

  const selectedCount = suggestions.filter((suggestion) => selectedItemNames.has(suggestion.itemName)).length;
  const canAdd = selectedCount > 0 && !isAdding && !isAdded;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        top: 0,
        zIndex,
        elevation: zIndex,
      }}
    >
      {showBackdrop ? (
        <Animated.View
          onStartShouldSetResponder={() => true}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            top: 0,
            backgroundColor: 'rgba(1, 7, 10, 0.58)',
            opacity: appearAnim,
          }}
        />
      ) : null}
      <Animated.View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom,
          opacity: appearAnim,
          transform: [
            {
              translateY: appearAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [18, 0],
              }),
            },
            {
              scale: appearAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.96, 1],
              }),
            },
          ],
        }}
      >
        <LinearGradient
          colors={['rgba(9, 12, 13, 0.98)', 'rgba(20, 108, 92, 0.96)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 20,
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.2)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 14 },
            shadowOpacity: 0.28,
            shadowRadius: 24,
            elevation: 12,
          }}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onDismiss}
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              width: 24,
              height: 24,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.14)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.2)',
              zIndex: 1,
            }}
          >
            <Ionicons name="close" size={15} color="#FFFFFF" />
          </TouchableOpacity>

          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 15,
              lineHeight: 20,
              fontWeight: '800',
              paddingRight: 28,
            }}
          >
            {isAdded ? 'Added to Wishlist.' : 'Add useful items to Wishlist?'}
          </Text>
          <Text
            numberOfLines={2}
            style={{
              color: 'rgba(255,255,255,0.82)',
              fontSize: 12,
              lineHeight: 16,
              marginTop: 4,
              paddingRight: 28,
            }}
          >
            {goalTitle}
          </Text>

          <View style={{ marginTop: 12 }}>
            {suggestions.map((suggestion, index) => {
              const selected = selectedItemNames.has(suggestion.itemName);
              return (
                <TouchableOpacity
                  key={`${suggestion.itemName}-${index}`}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (!isAdded) {
                      onToggleItem(suggestion.itemName);
                    }
                  }}
                  disabled={isAdding || isAdded}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginTop: index === 0 ? 0 : 8,
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: selected ? 'rgba(10, 152, 129, 0.18)' : 'rgba(255,255,255,0.045)',
                    borderWidth: selected ? 1.2 : 1,
                    borderColor: selected ? '#15BA9D' : 'rgba(255,255,255,0.08)',
                    opacity: isAdding ? 0.7 : 1,
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 10,
                      backgroundColor: selected ? '#0A9881' : 'rgba(255,255,255,0.045)',
                      borderWidth: 1,
                      borderColor: selected ? '#15BA9D' : 'rgba(255,255,255,0.12)',
                    }}
                  >
                    {selected ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: selected ? '#FFFFFF' : 'rgba(255,255,255,0.76)', fontSize: 14, lineHeight: 18, fontWeight: '800' }} numberOfLines={1}>
                      {suggestion.itemName}
                    </Text>
                    {suggestion.reason ? (
                      <Text style={{ color: selected ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 16, marginTop: 2 }} numberOfLines={2}>
                        {suggestion.reason}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {!isAdded ? (
            <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={onAddSelected}
                disabled={!canAdd}
                style={{ opacity: canAdd ? 1 : 0.62 }}
              >
                <LinearGradient
                  colors={['#0A9881', '#04473C']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderWidth: 1.2,
                    borderColor: '#15BA9D',
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 12, lineHeight: 14, fontWeight: '800' }}>
                    {isAdding ? 'Adding...' : 'Add items to Wishlist'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
              <Text
                style={{
                  color: 'rgba(255,255,255,0.58)',
                  fontSize: 11,
                  lineHeight: 13,
                  fontWeight: '700',
                  marginLeft: 10,
                }}
              >
                {selectedCount}/{suggestions.length} selected
              </Text>
            </View>
          ) : null}
        </LinearGradient>
      </Animated.View>
    </View>
  );
}
