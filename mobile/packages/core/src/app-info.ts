import Constants from 'expo-constants';

/** Which app this build is (customer or partner) and its version, from app.config. */
export const appInfo = {
  id: (Constants.expoConfig?.extra?.appId as 'customer' | 'partner' | undefined) ?? 'customer',
  version: Constants.expoConfig?.version ?? '0.0.0',
};
