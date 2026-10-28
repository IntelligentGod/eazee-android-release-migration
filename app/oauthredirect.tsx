import React from 'react';
import { Redirect } from 'expo-router';

export default function OAuthRedirectScreen() {
  return <Redirect href="/(tabs)/home/account" />;
}
