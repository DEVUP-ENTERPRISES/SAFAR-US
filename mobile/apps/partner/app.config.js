const buildConfig = require('@catodrive/core/app-config');

module.exports = () =>
  buildConfig({
    id: 'partner',
    name: 'CatoDrive Partner',
    slug: 'catodrive-partner',
    scheme: 'catodrive-partner',
    version: '1.0.0',
    bundleId: 'com.catodrive.partner',
    projectId: '6dfa0b83-542b-449b-b82a-58c160278058',
    iconBackground: '#15120f',
    cameraReason: 'CatoDrive Partner uses the camera to photograph your cars, documents and the car at pickup and return.',
    photosReason: 'CatoDrive Partner lets you choose photos of your cars and documents from your library.',
    locationReason: 'CatoDrive Partner uses your location to record where pickup and return photos were taken.',
  });
