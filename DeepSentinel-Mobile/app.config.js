// Extends app.json so the API host is configurable without touching source.
//
// The backend moves — a laptop's LAN address today, an Azure URL once the
// fusion engine is deployed. Everything that talks to it reads `API_BASE` from
// src/config.ts, which reads this, so a move is one environment variable and
// no code change at all:
//
//     EXPO_PUBLIC_API_BASE=https://<app>.azurewebsites.net npx expo start
//
// The fallback is a LAN address rather than localhost on purpose: on a phone
// `localhost` is the phone, so a wrong default fails in a way that looks like
// the server is down.

// A note on `usesCleartextTraffic` in app.json, which JSON cannot carry itself:
//
// Android blocks plain HTTP by default from targetSdk 28 onward, and only the
// debug manifest opts back in. A release APK therefore could not reach the
// fusion engine on the LAN at all — and the failure surfaces as a connection
// error, which reads as a network problem when the OS is refusing to send the
// request in the first place.
//
// Cleartext is enabled because during development the backend is a laptop on
// the same Wi-Fi, and http:// is the only address it has. Once the fusion
// engine is on Azure the address becomes https:// and this should be removed:
// it is a development affordance, not a decision about how the app should ship.

const config = require("./app.json");

module.exports = {
  ...config.expo,
  extra: {
    ...(config.expo.extra ?? {}),
    apiBase: process.env.EXPO_PUBLIC_API_BASE ?? "http://192.168.1.159:8090",
  },
};
