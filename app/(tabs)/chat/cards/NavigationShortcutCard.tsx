import { Text, TouchableOpacity, View } from 'react-native';
import MIcon from '@expo/vector-icons/MaterialCommunityIcons';
import type { Router } from 'expo-router';
import { CHAT_SURFACE_RADIUS } from '../constants';
import { useGuidance } from '@/components/guidance/GuidanceProvider';
import {
  getGuidanceTargetFromShortcut,
  type GuidanceTarget,
} from '@/lib/navigationHelp';
import { useNavigationHelpMode } from '@/lib/useNavigationHelpMode';
import { handleNavigationHelpTarget } from '@/lib/handleNavigationHelpTarget';

type Props = {
  label?: string;
  route?: string;
  params?: Record<string, any>;
  target?: GuidanceTarget;
  router: Router;
};

export function NavigationShortcutCard({ label, route, params, target, router }: Props) {
  const targetLabel = String(label || 'that screen');
  const { mode } = useNavigationHelpMode();
  const { startGuidance } = useGuidance();
  const guidanceTarget = target || getGuidanceTargetFromShortcut(route, params);
  const isGuideMode = mode === 'guide' && guidanceTarget?.type === 'screen';

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() => {
        if (!route && !guidanceTarget) return;
        if (guidanceTarget) {
          handleNavigationHelpTarget({
            target: guidanceTarget,
            label: targetLabel,
            mode,
            startGuidance,
            router,
            fallback: { route, params },
            // A fresh value each tap, so the screen acts on the params again (e.g. Home
            // switching back to the plan's day after the user moved to another day).
            extraParams: { navNonce: String(Date.now()) },
          });
          return;
        }
        router.push({ pathname: route as any, params: { ...(params || {}), navNonce: String(Date.now()) } });
      }}
      style={{
        backgroundColor: 'rgba(2, 77, 76, 0.82)',
        borderColor: 'rgba(135, 249, 238, 0.32)',
        borderRadius: CHAT_SURFACE_RADIUS,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 13,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(135, 249, 238, 0.16)',
          }}
        >
          <MIcon name={isGuideMode ? 'map-marker-outline' : 'arrow-right'} size={20} color="#B9FFFA" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }} numberOfLines={1}>
            {isGuideMode ? `Show me where ${targetLabel} is` : `Tap here to go to ${targetLabel}`}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
