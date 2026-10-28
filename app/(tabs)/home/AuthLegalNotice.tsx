import React from 'react';
import { StyleSheet, Text } from 'react-native';
import * as Linking from 'expo-linking';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/lib/legalLinks';

type AuthLegalNoticeProps = {
  actionText?: string;
};

export function AuthLegalNotice({ actionText = 'continuing' }: AuthLegalNoticeProps) {
  const openLink = (url: string) => {
    void Linking.openURL(url).catch((error) => {
      console.warn('Failed to open legal link', error);
    });
  };

  return (
    <Text style={styles.text}>
      {`By ${actionText}, you agree to our `}
      <Text style={styles.link} onPress={() => openLink(TERMS_URL)}>Terms</Text>
      {' and acknowledge our '}
      <Text style={styles.link} onPress={() => openLink(PRIVACY_POLICY_URL)}>Privacy Policy</Text>
      .
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    color: 'rgba(250, 244, 214, 0.86)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    marginTop: 6,
    textAlign: 'center',
  },
  link: {
    color: '#FFFFFF',
    textDecorationLine: 'underline',
  },
});
