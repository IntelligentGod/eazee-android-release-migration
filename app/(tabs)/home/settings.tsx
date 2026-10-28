import React from 'react';
import { Redirect } from 'expo-router';

export default function SettingsRedirectScreen() {
  return <Redirect href={{ pathname: '/(tabs)/home', params: { manageAccount: 'true' } }} />;
}
