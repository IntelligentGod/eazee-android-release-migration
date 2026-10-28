import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthSession } from '../../context/AuthSessionContext';

export default function AccountRedirectScreen() {
  const { user, isLoading } = useAuthSession();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9ECEB' }}>
        <ActivityIndicator size="small" color="#22AB93" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href={{ pathname: '/home/login', params: { source: 'home' } }} />;
  }

  return <Redirect href={{ pathname: '/(tabs)/home', params: { manageAccount: 'true' } }} />;
}
