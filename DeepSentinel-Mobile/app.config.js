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

const config = require("./app.json");

module.exports = {
  ...config.expo,
  extra: {
    ...(config.expo.extra ?? {}),
    apiBase: process.env.EXPO_PUBLIC_API_BASE ?? "http://192.168.1.159:8090",
  },
};
