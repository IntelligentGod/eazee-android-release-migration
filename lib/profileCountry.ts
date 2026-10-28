import AsyncStorage from '@react-native-async-storage/async-storage';

type StoredCountry = {
  cca2?: string;
};

const DEFAULT_COUNTRY_CODE = 'US';
const PROFILE_COUNTRY_STORAGE_KEY_PREFIX = 'profileCountry:';

export const getProfileCountryStorageKey = (userId: string) =>
  `${PROFILE_COUNTRY_STORAGE_KEY_PREFIX}${userId}`;

export const readProfileCountryCode = async (userId?: string | null) => {
  if (!userId) {
    return DEFAULT_COUNTRY_CODE;
  }

  try {
    const storedCountry = await AsyncStorage.getItem(getProfileCountryStorageKey(userId));
    if (!storedCountry) {
      return DEFAULT_COUNTRY_CODE;
    }

    const parsedCountry = JSON.parse(storedCountry) as StoredCountry;
    return typeof parsedCountry.cca2 === 'string' && parsedCountry.cca2.trim()
      ? parsedCountry.cca2.toUpperCase()
      : DEFAULT_COUNTRY_CODE;
  } catch (error) {
    console.error('Error reading profile country:', error);
    return DEFAULT_COUNTRY_CODE;
  }
};
