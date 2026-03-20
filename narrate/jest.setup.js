// Polyfill import.meta for jest (Expo 55+ uses import.meta internally)
if (typeof globalThis.__ExpoImportMetaRegistry === 'undefined') {
  globalThis.__ExpoImportMetaRegistry = {
    url: 'file://',
  };
}
