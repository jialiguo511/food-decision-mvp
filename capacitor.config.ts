import type { CapacitorConfig } from "@capacitor/cli";

// The iOS app (docs/IOS_RELEASE.md). PROTOTYPE shape: the WebView loads the hosted app from
// CAP_SERVER_URL — a local dev server for the Simulator (http://localhost:3000), a Vercel Preview
// for a device build. `mobile/www` is bundled in the app: the launch page and the can't-connect
// page (`errorPath`), so a phone with no network never shows a blank screen.
//
// The bundle id is a placeholder until the App Store Connect record exists; it cannot be changed
// after the first TestFlight upload.
const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: process.env.CAP_APP_ID ?? "com.whatshouldieat.app",
  appName: "What to Eat",
  webDir: "mobile/www",
  // The WebView's own colour before a page paints: cream, never a white flash on a slow load.
  backgroundColor: "#FBF7F0",
  ios: {
    contentInset: "never",
    // Pages ask for the user's location only after a tap; nothing else in the WebView is native.
    limitsNavigationsToAppBoundDomains: false,
  },
  server: serverUrl
    ? {
        url: serverUrl,
        // Plain http is allowed only for a localhost dev server.
        cleartext: serverUrl.startsWith("http://localhost"),
        errorPath: "offline.html",
      }
    : undefined,
  plugins: {
    // The page hides the launch screen once it has painted (NativeBridge); 3 s is the safety net for a
    // page that never runs our code.
    SplashScreen: { launchShowDuration: 3000, launchAutoHide: true, backgroundColor: "#FBF7F0", showSpinner: false },
    StatusBar: { style: "LIGHT", overlaysWebView: true },
  },
};

export default config;
