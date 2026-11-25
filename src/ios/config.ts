// Build-time settings of the bundled iOS app (scripts/ios-build.mjs sets them). Public values only.

/** True only in the bundled iOS build. */
export const IS_BUNDLED_APP = process.env.NEXT_PUBLIC_BUNDLED_APP === "1";
/** The backend the app talks to (a Vercel Preview for beta builds, production for release). */
export const API_BASE = (process.env.NEXT_PUBLIC_APP_API_BASE ?? "").replace(/\/$/, "");
/** This app build's version, sent with every request and checked against MIN_IOS_APP_VERSION. */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

/** Fired after a write succeeds, so screens showing server data re-read it. */
export const DATA_CHANGED = "app:data-changed";
/** Fired when the backend says this app version is no longer served. */
export const UPDATE_REQUIRED = "app:update-required";
