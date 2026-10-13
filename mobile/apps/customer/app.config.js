const buildConfig = require('@catodrive/core/app-config');

module.exports = () =>
  buildConfig({
    id: 'customer',
    name: 'CatoDrive',
    slug: 'catodrive',
    scheme: 'catodrive',
    version: '1.0.0',
    bundleId: 'com.catodrive.app',
    projectId: 'c55a3015-f0c6-4b09-8445-281fecf1d5d2',
    iconBackground: '#f8f6f2',
    cameraReason: 'CatoDrive uses the camera to scan your licence, take your verification selfie and photograph the car at pickup and return.',
    photosReason: 'CatoDrive lets you choose photos of your licence or the car from your library.',
    locationReason: 'CatoDrive uses your location to show cars near you and to record where trip photos were taken.',
    plugins: [['@stripe/stripe-react-native', { merchantIdentifier: 'merchant.com.catodrive.app', enableGooglePay: true }]],
  });
