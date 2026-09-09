import Constants from 'expo-constants';

export const REVENUECAT_API_KEY =
  Constants.expoConfig?.extra?.variant === 'production'
    ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
