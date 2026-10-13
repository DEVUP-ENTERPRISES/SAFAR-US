/*
 * Shared Expo config for both apps. Each app's app.config.js passes its own
 * identity; everything else (permissions, plugins, updates) is identical.
 * Each app passes its own EAS project id; native keys (Google Maps, google-services.json) come from
 * EAS environment variables, never from git.
 */
const BLOCKED_PERMISSIONS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.RECORD_AUDIO',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'com.google.android.gms.permission.AD_ID',
];

module.exports = function buildConfig(app) {
  const projectId = app.projectId ?? process.env.EAS_PROJECT_ID;
  return {
    // The company Expo organisation owns both apps' builds and releases.
    owner: 'devup-ventures-01',
    name: app.name,
    slug: app.slug,
    scheme: app.scheme,
    version: app.version,
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    runtimeVersion: { policy: 'appVersion' },
    ...(projectId ? { updates: { url: `https://u.expo.dev/${projectId}`, checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 0 } } : {}),
    ios: {
      bundleIdentifier: app.bundleId,
      supportsTablet: false,
      infoPlist: {
        NSCameraUsageDescription: app.cameraReason,
        NSPhotoLibraryUsageDescription: app.photosReason,
        NSLocationWhenInUseUsageDescription: app.locationReason,
        ITSAppUsesNonExemptEncryption: false,
      },
      associatedDomains: ['applinks:www.catodrive.com'],
    },
    android: {
      package: app.bundleId,
      adaptiveIcon: {
        backgroundColor: app.iconBackground,
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      blockedPermissions: BLOCKED_PERMISSIONS,
      permissions: ['android.permission.CAMERA', 'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION'],
      ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
      ...(process.env.GOOGLE_MAPS_ANDROID_KEY ? { config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY } } } : {}),
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      'expo-image',
      'expo-web-browser',
      'expo-localization',
      'expo-font',
      ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 180, backgroundColor: app.iconBackground, dark: { backgroundColor: '#15120f' } }],
      ['expo-image-picker', { cameraPermission: app.cameraReason, photosPermission: app.photosReason, microphonePermission: false }],
      ['expo-location', { locationWhenInUsePermission: app.locationReason, isAndroidBackgroundLocationEnabled: false }],
      ['expo-notifications', { color: '#0e9090' }],
      ...(app.plugins ?? []),
    ],
    experiments: { typedRoutes: false },
    extra: {
      appId: app.id,
      ...(projectId ? { eas: { projectId } } : {}),
    },
  };
};
