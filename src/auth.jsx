// =============================================================================
// auth.jsx  -  "WHO IS LOGGED IN, ARE THEY AN ADMIN, AND HAVE THEY ONBOARDED?"
//
// One place to fetch api.getMe() and remember the answer, instead of every
// screen that cares about the role (Layout's menu, ManagePlaces, PlaceForm,
// the admin request queue, System health) making its own copy of the same
// fetch. Same pattern as theme.jsx / i18n.jsx / notifications.jsx.
//
// `role` comes from the JWT the backend issued at login (see
// services/user-service/app/security.py's create_access_token) - this
// context just surfaces it to React, it doesn't decide anything.
//
// -----------------------------------------------------------------------
// BUG FIX - "reload the page and it breaks" / "have to log out and log
// back in for the app to work"
// -----------------------------------------------------------------------
// The old refresh() did this:
//
//   api.getMe().then(setUser).catch(() => setUser(null)).finally(...)
//
// ANY failure - a genuinely expired/invalid token, but ALSO a one-off
// network blip, the gateway being mid-restart, or a slow cold start on
// the first request after deploy - wiped the signed-in user out of
// React state. The JWT itself (see security.py: JWT_EXPIRY_HOURS = 7
// days) was still perfectly valid and still sitting in localStorage, but
// the app now *behaved* as logged out: protected screens redirected to
// /login, the header showed no profile. Reloading again often "fixed"
// it purely by luck (the transient failure happened not to repeat), and
// when it didn't, a full log out + log back in was the only escape
// hatch a user could find - even though nothing was actually wrong with
// their session.
//
// The fix distinguishes WHY getMe() failed, using the real HTTP status
// now attached to every thrown error (see api/client.js's ApiError):
//   - status 401              -> the token really is invalid/expired.
//                                 Clear it and show the login screen.
//   - anything else (0 = the
//     request never reached
//     the server, 500, 502...) -> a transient problem, NOT a reason to
//                                 sign anyone out. Keep the existing
//                                 token, keep retrying with backoff, and
//                                 only give up after several attempts -
//                                 surfacing a clear "can't reach the
//                                 server" state instead of silently
//                                 pretending the user logged out.
// =============================================================================

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api, authStorage } from "./api/client";

const AuthContext = createContext({
  user: null,
  loading: true,
  isAdmin: false,
  // null = "don't know yet" (still checking), true/false once we do.
  hasOnboarded: null,
  connectionError: false,
  refresh: () => {},
});

// How many times to retry a transient failure before giving up and
// showing a "can't reach the server" state, and how long to wait between
// attempts (grows a little each time so a real outage doesn't hammer the
// gateway with requests every second).
const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 1500;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasOnboarded, setHasOnboarded] = useState(null);
  const [connectionError, setConnectionError] = useState(false);

  // Tracks the in-flight refresh so a token change or unmount mid-retry
  // doesn't let a stale retry chain overwrite fresher state later.
  const refreshTokenRef = useRef(0);
  const retryTimerRef = useRef(null);

  const clearSession = () => {
    authStorage.clearToken();
    setUser(null);
    setHasOnboarded(null);
  };

  const attemptLoad = (attempt, myToken) => {
    // A newer refresh() call (or a token change) superseded this chain -
    // stop, so two overlapping retry loops can't fight over state.
    if (myToken !== refreshTokenRef.current) return;

    Promise.allSettled([api.getMe(), api.getPreferences()]).then(([meResult, prefsResult]) => {
      if (myToken !== refreshTokenRef.current) return;

      if (meResult.status === "fulfilled") {
        setUser(meResult.value);
        setConnectionError(false);
        setLoading(false);
        // Preferences: fulfilled means they exist (onboarded). A 404
        // ("No preferences saved yet") rejects with status 404 - that is
        // a normal, expected answer for a first-time user, not an error.
        // Any OTHER failure here (network, 500) means we genuinely don't
        // know yet - leave hasOnboarded as null rather than guessing, so
        // ProtectedRoute doesn't wrongly bounce someone to onboarding
        // just because one request hiccuped.
        if (prefsResult.status === "fulfilled") {
          setHasOnboarded(true);
        } else if (prefsResult.reason?.status === 404) {
          setHasOnboarded(false);
        }
        return;
      }

      // getMe() failed. Was it a real auth rejection, or a transient one?
      const status = meResult.reason?.status;
      if (status === 401) {
        clearSession();
        setConnectionError(false);
        setLoading(false);
        return;
      }

      // Transient (network down, gateway restarting, 5xx, etc.) - the
      // token is presumably still fine. Retry with backoff instead of
      // signing the user out from under them.
      if (attempt < MAX_RETRIES) {
        retryTimerRef.current = setTimeout(
          () => attemptLoad(attempt + 1, myToken),
          RETRY_BASE_DELAY_MS * (attempt + 1)
        );
        // Stay in `loading` while we retry - a brief spinner is far less
        // jarring than flashing "logged out" and then back to "logged in".
      } else {
        // Out of retries. Keep the token (it may well still be valid -
        // we just can't reach the server right now) but stop the
        // spinner and tell the UI plainly what's wrong instead of
        // silently behaving as logged out.
        setConnectionError(true);
        setLoading(false);
      }
    });
  };

  const refresh = () => {
    clearTimeout(retryTimerRef.current);
    const myToken = ++refreshTokenRef.current;
    const token = authStorage.getToken();

    if (!token) {
      setUser(null);
      setHasOnboarded(null);
      setConnectionError(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setConnectionError(false);
    attemptLoad(0, myToken);
  };

  useEffect(() => {
    refresh();

    // Cross-tab logout/login: another tab clearing or setting the token
    // (see Layout.jsx's handleLogout, and Login.jsx) should be reflected
    // here too, instead of this tab carrying on as if nothing changed
    // until its own next full reload.
    const handleStorageChange = (event) => {
      if (event.key === "gt_token") refresh();
    };
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearTimeout(retryTimerRef.current);
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin: user?.role === "admin",
        hasOnboarded,
        connectionError,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// A dedicated logout() (rather than screens calling authStorage.clearToken()
// directly, as Layout.jsx used to) makes sure the in-memory `user` is wiped
// in THIS tab immediately too - the browser's `storage` event, which is what
// picks up a token change for cross-tab sync, only ever fires in OTHER tabs,
// never the one that made the change. Without this, the tab that clicked
// "Log out" kept its old `user` in React state until something else
// happened to call refresh(), which could very briefly leave stale
// role-gated UI (e.g. an admin-only menu entry) visible after logging out.
export function useLogout() {
  const { refresh } = useAuth();
  return () => {
    authStorage.clearToken();
    refresh();
  };
}
