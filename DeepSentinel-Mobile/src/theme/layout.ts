import { Platform, StatusBar } from "react-native";

/**
 * The space the system status bar occupies at the top of the screen.
 *
 * React Native's `SafeAreaView` only insets on iOS. On Android it renders as a
 * plain `View`, so a header laid out inside one sits underneath the clock and
 * the battery icon — which is exactly how the account name in the alert
 * header ended up jammed against the status bar.
 *
 * Applied as padding by every screen's root rather than fixed per screen, so
 * a screen added later does not have to remember.
 */
export const statusBarInset =
  Platform.OS === "android" ? StatusBar.currentHeight ?? 24 : 0;
