import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import MIcon from '@expo/vector-icons/MaterialCommunityIcons';
import { CHAT_SURFACE_RADIUS } from '../constants';

export type RecipeTodoOfferCardValue = {
  recipeTitle?: string;
  details?: string;
  offerKey?: string;
  opened?: boolean;
  dismissed?: boolean;
};

type Props = {
  offer: RecipeTodoOfferCardValue;
  onOpen: (offer: RecipeTodoOfferCardValue) => Promise<boolean>;
  onDismiss: (offer: RecipeTodoOfferCardValue) => Promise<void>;
};

export function RecipeTodoOfferCard({ offer, onOpen, onDismiss }: Props) {
  const [isWorking, setIsWorking] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [hasDeclined, setHasDeclined] = useState(false);
  const [error, setError] = useState('');
  const recipeTitle = String(offer?.recipeTitle || 'Recipe');
  const isOpen = hasOpened || !!offer?.opened;
  const isDismissed = hasDeclined || !!offer?.dismissed;
  const heading = isOpen
    ? 'Recipe created in Todo'
    : 'Want a guided recipe mode?';

  if (isDismissed) {
    return null;
  }

  const handleOpen = async () => {
    if (isWorking || isDismissed) return;
    setIsWorking(true);
    setError('');
    try {
      const opened = await onOpen(offer);
      if (opened) {
        setHasOpened(true);
      } else {
        setError('Could not open this in Todo.');
      }
    } catch {
      setError('Could not open this in Todo.');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <View
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        borderColor: 'rgba(255, 255, 255, 0.12)',
        borderRadius: CHAT_SURFACE_RADIUS,
        borderWidth: 1,
        padding: 13,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isOpen ? 'rgba(128, 237, 153, 0.16)' : 'rgba(158, 232, 219, 0.13)',
            borderColor: isOpen ? 'rgba(128, 237, 153, 0.28)' : 'rgba(158, 232, 219, 0.22)',
            borderWidth: 1,
          }}
        >
          <MIcon
            name={isOpen ? 'check' : 'silverware-fork-knife'}
            size={18}
            color={isOpen ? '#A8F7B8' : '#B9FFFA'}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>
            {heading}
          </Text>
          {!isOpen && (
            <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 17, marginTop: 3 }}>
              Choose a video in Todo for transcript-based steps, timestamps, and ingredients.
            </Text>
          )}
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{ color: '#9EE8DB', fontSize: 13, fontWeight: '700', marginTop: isOpen ? 3 : 6 }}
          >
            {recipeTitle}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <TouchableOpacity
          activeOpacity={0.82}
          disabled={isWorking}
          onPress={() => void handleOpen()}
          style={{
            alignItems: 'center',
            backgroundColor: 'rgba(158, 232, 219, 0.18)',
            borderColor: 'rgba(158, 232, 219, 0.28)',
            borderRadius: 10,
            borderWidth: 1,
            flexDirection: 'row',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <MIcon name="open-in-new" size={14} color="#E8FFFA" />
          <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>
            {isWorking ? 'Opening...' : 'Open in Todo'}
          </Text>
        </TouchableOpacity>
        {!isOpen && (
          <TouchableOpacity
            activeOpacity={0.82}
            disabled={isWorking}
            onPress={() => {
              setError('');
              setHasDeclined(true);
              void onDismiss(offer);
            }}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: 10,
              borderWidth: 1,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.82)', fontWeight: '800' }}>Keep chatting</Text>
          </TouchableOpacity>
        )}
      </View>
      {!!error && (
        <Text style={{ color: '#FFD7D7', fontSize: 12, marginTop: 8 }}>{error}</Text>
      )}
    </View>
  );
}
