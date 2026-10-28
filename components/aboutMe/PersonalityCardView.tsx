import React, { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CARD_HEIGHT, CARD_PADDING, CARD_WIDTH, fitCardText } from '@/lib/aboutMe/cardLayout';

export type PersonalityCardContent = {
  title: string;
  caption: string;
  superpower: string;
  plotTwist: string;
  move: string;
  /** e.g. "Playful take on your self-reported ENFP". */
  basisLabel: string;
};

/**
 * The shareable card, 4:5 (saved as 1080 x 1350). It shows only the joke: no name, photo,
 * age, work, goals, chat text, scores or answers.
 */
const PersonalityCardView = forwardRef<View, { content: PersonalityCardContent; width: number }>(
  function PersonalityCardView({ content, width }, ref) {
    // Everything is sized from the width so the saved image matches the preview, and the text is
    // sized to the content so long themes still fit with the footer in place.
    const unit = width / CARD_WIDTH;
    const size = (value: number) => Math.round(value * unit * 10) / 10;
    const text = fitCardText(content);
    return (
      <View ref={ref} collapsable={false} style={{ width, height: width * (CARD_HEIGHT / CARD_WIDTH), borderRadius: size(28), overflow: 'hidden' }}>
        <LinearGradient
          colors={['#0E7465', '#05504A', '#032E2A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { padding: size(CARD_PADDING), justifyContent: 'space-between' }]}
        >
          <View style={{ gap: size(text.gap) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: size(8) }}>
              <Image source={require('../../assets/images/eazee-logo-big.png')} style={{ width: size(30), height: size(30) }} />
              <Text style={{ color: '#AEFFE8', fontSize: size(12), fontWeight: '800', letterSpacing: size(1.6) }}>
                YOUR EAZEE PERSONALITY
              </Text>
            </View>
            <Text style={{ color: '#FFFFFF', fontSize: size(text.title), lineHeight: size(text.titleLine), fontWeight: '900', letterSpacing: size(0.3) }}>
              {content.title.toUpperCase()}
            </Text>
            <Text style={{ color: '#E8FFFA', fontSize: size(text.caption), lineHeight: size(text.captionLine), fontWeight: '600' }}>
              {`“${content.caption}”`}
            </Text>
          </View>

          <View style={{ gap: size(12) }}>
            {[
              ['SUPERPOWER', content.superpower],
              ['PLOT TWIST', content.plotTwist],
              ['YOUR EAZEE MOVE', content.move],
            ].map(([label, value]) => (
              <View key={label} style={{ gap: size(2) }}>
                <Text style={{ color: '#AEFFE8', fontSize: size(text.label), lineHeight: size(14), fontWeight: '800', letterSpacing: size(1.4) }}>{label}</Text>
                <Text style={{ color: '#FFFFFF', fontSize: size(text.value), lineHeight: size(text.valueLine), fontWeight: '700' }}>{value}</Text>
              </View>
            ))}
          </View>

          <View style={{ gap: size(4) }}>
            <Text style={{ color: 'rgba(232, 255, 250, 0.7)', fontSize: size(11), lineHeight: size(14) }} numberOfLines={1}>{content.basisLabel}</Text>
            <Text style={{ color: 'rgba(232, 255, 250, 0.85)', fontSize: size(11), lineHeight: size(14), fontWeight: '700' }}>
              A playful personality snapshot • eazee.ai
            </Text>
          </View>
        </LinearGradient>
      </View>
    );
  }
);

export default PersonalityCardView;
