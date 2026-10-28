import React from 'react';
import { Animated, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { format } from 'date-fns';
import Markdown from 'react-native-markdown-display';
import type { CompactAiNotice } from '@/lib/useCompactTabAI';
import { parseCalendarDateValue } from '@/utils/calendarDates';

type CompactSurface = 'todo' | 'calendar' | 'home';

type CompactAiBannerProps = {
  notice: CompactAiNotice | null;
  surface: CompactSurface;
  top?: number;
  bottom?: number;
  translateY?: number | Animated.AnimatedInterpolation<number>;
  size?: 'default' | 'small';
  translucent?: boolean;
  onActionPress?: () => void;
  onDismissPress?: () => void;
  onCancelPress?: () => void;
};

const bannerColorsBySurface: Record<CompactSurface, [string, string]> = {
  todo: ['rgba(9, 12, 13, 0.98)', 'rgba(20, 108, 92, 0.96)'],
  calendar: ['rgba(12, 24, 27, 0.99)', 'rgba(54, 118, 128, 0.96)'],
  home: ['rgba(34, 33, 29, 0.99)', 'rgba(73, 71, 63, 0.97)'],
};

function formatCalendarNoticeTimeRange(startDate: string, endDate?: string, isAllDay?: boolean) {
  const start = parseCalendarDateValue(startDate);
  const end = parseCalendarDateValue(endDate);

  if (!start) return '';

  if (isAllDay) {
    if (!end) return `${format(start, 'EEE, MMM d')} • All day`;
    const inclusiveEnd = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    if (inclusiveEnd.toDateString() === start.toDateString()) {
      return `${format(start, 'EEE, MMM d')} • All day`;
    }
    return `${format(start, 'EEE, MMM d')} - ${format(inclusiveEnd, 'EEE, MMM d')} • All day`;
  }

  if (!end) return format(start, 'EEE, MMM d • h:mm a');
  const sameDay = start.toDateString() === end.toDateString();
  return `${format(start, 'EEE, MMM d • h:mm a')} - ${format(end, sameDay ? 'h:mm a' : 'EEE, MMM d • h:mm a')}`;
}

function CalendarNoticeCards({ notice }: { notice: CompactAiNotice }) {
  if (!notice.calendarItems?.length) return null;

  return (
    <View style={{ marginTop: 12 }}>
      {notice.calendarItems.map((item, index) => {
        const timeText = formatCalendarNoticeTimeRange(item.startDate, item.endDate, item.isAllDay);
        const sourceLabel = item.source === 'google' ? 'Google' : 'Calendar';

        return (
          <View
            key={`${item.source}-${item.id}-${index}`}
            style={{
              marginTop: index === 0 ? 0 : 8,
              borderRadius: 18,
              paddingHorizontal: 16,
              paddingVertical: 15,
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.16)',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ flex: 1, color: '#FFFFFF', fontSize: 20, lineHeight: 25, fontWeight: '700', marginRight: 12 }} numberOfLines={2}>
                {item.title || 'Untitled event'}
              </Text>
              <View
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 11,
                  paddingVertical: 5,
                  backgroundColor: item.source === 'google' ? 'rgba(66, 133, 244, 0.24)' : 'rgba(34, 171, 147, 0.24)',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 17, fontWeight: '700' }}>{sourceLabel}</Text>
              </View>
            </View>
            {timeText ? (
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 17, lineHeight: 23, marginTop: 7 }} numberOfLines={2}>
                {timeText}
              </Text>
            ) : null}
            {item.location ? (
              <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 17, lineHeight: 23, marginTop: 6 }} numberOfLines={1}>
                {item.location}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export default function CompactAiBanner({
  notice,
  surface,
  top,
  bottom,
  translateY,
  size = 'default',
  translucent = false,
  onActionPress,
  onDismissPress,
  onCancelPress,
}: CompactAiBannerProps) {
  if (!notice) return null;

  const colors: [string, string] = translucent && surface === 'calendar'
    ? ['rgba(12, 24, 27, 0.82)', 'rgba(54, 118, 128, 0.72)']
    : bannerColorsBySurface[surface];
  const cardPositionStyle = top != null ? { top } : { bottom: bottom ?? 0 };
  const cardTransform = translateY != null ? [{ translateY }] : undefined;
  const isSmall = size === 'small';
  const isCardPressable = notice.kind === 'toast' && !!notice.target && !!onActionPress;
  const cardContent = (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        position: 'relative',
        borderRadius: isSmall ? 20 : 26,
        paddingHorizontal: isSmall ? 16 : 22,
        paddingVertical: isSmall ? 14 : 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: isSmall ? 8 : 14 },
        shadowOpacity: isSmall ? 0.22 : 0.28,
        shadowRadius: isSmall ? 14 : 24,
        elevation: isSmall ? 8 : 12,
      }}
    >
      {onDismissPress ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onDismissPress}
          style={{
            position: 'absolute',
            top: isSmall ? 8 : 12,
            right: isSmall ? 8 : 12,
            width: isSmall ? 24 : 34,
            height: isSmall ? 24 : 34,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.14)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.2)',
            zIndex: 1,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: isSmall ? 13 : 18, lineHeight: isSmall ? 13 : 18, fontWeight: '700' }}>x</Text>
        </TouchableOpacity>
      ) : null}
      <Markdown
        style={{
          body: {
            color: '#FFFFFF',
            fontSize: isSmall ? 16 : 22,
            lineHeight: isSmall ? 21 : 29,
            fontWeight: '700',
            paddingRight: onDismissPress ? (isSmall ? 28 : 42) : 0,
            margin: 0,
          },
          paragraph: {
            marginTop: 0,
            marginBottom: 0,
          },
          strong: {
            color: '#FFFFFF',
            fontWeight: '800',
          },
          em: {
            color: '#FFFFFF',
            fontStyle: 'italic',
          },
          link: {
            color: '#FFFFFF',
            textDecorationLine: 'underline',
          },
        }}
      >
        {notice.message}
      </Markdown>
      <CalendarNoticeCards notice={notice} />
      {(notice.kind === 'clarify' && onCancelPress) || (notice.kind === 'confirm' && (onCancelPress || (notice.actionLabel && onActionPress))) ? (
        <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center' }}>
          {onCancelPress ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onCancelPress}
              style={{
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 8,
                backgroundColor: 'rgba(255,255,255,0.14)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.2)',
                marginRight: notice.kind === 'confirm' && notice.actionLabel && onActionPress ? 12 : 0,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 16, lineHeight: 19, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
          ) : null}
          {notice.kind === 'confirm' && notice.actionLabel && onActionPress ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onActionPress}
              style={{
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 8,
                backgroundColor:
                  notice.actionVariant === 'destructive' ? 'rgba(255, 99, 92, 0.18)' : 'rgba(255,255,255,0.14)',
                borderWidth: 1,
                borderColor:
                  notice.actionVariant === 'destructive' ? 'rgba(255, 140, 132, 0.45)' : 'rgba(255,255,255,0.24)',
              }}
            >
              <Text
                style={{
                  color: notice.actionVariant === 'destructive' ? '#FFE5E1' : '#FFFFFF',
                  fontSize: 16,
                  lineHeight: 19,
                  fontWeight: '700',
                }}
              >
                {notice.actionLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {notice.kind !== 'confirm' && notice.actionLabel && onActionPress ? (
        <View style={{ marginTop: 16, alignItems: 'flex-start' }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onActionPress}
            style={{
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 8,
              backgroundColor:
                notice.actionVariant === 'destructive' ? 'rgba(255, 99, 92, 0.18)' : 'rgba(255,255,255,0.14)',
              borderWidth: 1,
              borderColor:
                notice.actionVariant === 'destructive' ? 'rgba(255, 140, 132, 0.45)' : 'rgba(255,255,255,0.24)',
            }}
          >
            <Text
              style={{
                color: notice.actionVariant === 'destructive' ? '#FFE5E1' : '#FFFFFF',
                fontSize: 16,
                lineHeight: 19,
                fontWeight: '700',
              }}
            >
              {notice.actionLabel}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </LinearGradient>
  );

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
      }}
    >
      <Animated.View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          ...cardPositionStyle,
          transform: cardTransform,
        }}
      >
        {isCardPressable ? (
          <TouchableOpacity activeOpacity={0.94} onPress={onActionPress}>
            {cardContent}
          </TouchableOpacity>
        ) : (
          cardContent
        )}
      </Animated.View>
    </View>
  );
}
