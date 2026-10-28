import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import MIcon from '@expo/vector-icons/MaterialCommunityIcons';
import type { Router } from 'expo-router';
import { CHAT_SURFACE_RADIUS } from '../constants';
import { getAiActionsLimitMessage } from '@/lib/aiActions';

/** Opens Home's settings on the Eazee Pro panel. */
export const openProPaywall = (router: Router) => {
  router.push({
    pathname: '/(tabs)/home' as any,
    params: { settings: 'true', settingsPanel: 'paywall', settingsNonce: String(Date.now()) },
  });
};

/**
 * Today's free AI actions are used up (or a request had more items than were left). Chatting
 * still works; Keep Chatting just puts the buttons away.
 */
export function AiActionsLimitCard({ limit, notDone, router }: { limit?: number; notDone?: number; router: Router }) {
  const [isClosed, setIsClosed] = useState(false);
  const skipped = typeof notDone === 'number' && notDone > 0 ? notDone : 0;
  return (
    <View
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        borderColor: 'rgba(255, 231, 179, 0.22)',
        borderRadius: CHAT_SURFACE_RADIUS,
        borderWidth: 1,
        padding: 13,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255, 231, 179, 0.14)',
            borderColor: 'rgba(255, 231, 179, 0.26)',
            borderWidth: 1,
          }}
        >
          <MIcon name="lightning-bolt-outline" size={18} color="#FFE7B3" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          {skipped > 0 && (
            <Text style={{ color: '#FFE7B3', fontSize: 13, fontWeight: '800', marginBottom: 4 }}>
              {`${skipped} ${skipped === 1 ? 'item was' : 'items were'} not done.`}
            </Text>
          )}
          <Text style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 20, fontWeight: '700' }}>
            {getAiActionsLimitMessage(limit)}
          </Text>
        </View>
      </View>
      {!isClosed && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={() => openProPaywall(router)}
            style={{
              alignItems: 'center',
              backgroundColor: '#9EF5E4',
              borderRadius: 10,
              flexDirection: 'row',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <MIcon name="crown-outline" size={15} color="#00262A" />
            <Text style={{ color: '#00262A', fontWeight: '800' }}>Upgrade to Pro</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={() => setIsClosed(true)}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: 10,
              borderWidth: 1,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.82)', fontWeight: '800' }}>Keep Chatting</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

/** The quiet heads-up when only a couple of free AI actions are left today. */
export function AiActionsNotice({ remaining, limit }: { remaining?: number; limit?: number }) {
  if (typeof remaining !== 'number') return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
      <MIcon name="lightning-bolt-outline" size={13} color="rgba(255, 231, 179, 0.8)" />
      <Text style={{ color: 'rgba(255, 255, 255, 0.62)', fontSize: 12, fontWeight: '600' }}>
        {`${remaining}${typeof limit === 'number' ? `/${limit}` : ''} free AI ${remaining === 1 ? 'action' : 'actions'} left today. Chatting stays unlimited.`}
      </Text>
    </View>
  );
}
