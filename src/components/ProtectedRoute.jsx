// =============================================================================
// ProtectedRoute.jsx  -  GATES A SCREEN BEHIND LOGIN, AND ONBOARDING
//
// WHAT WAS WRONG BEFORE
// ----------------------
// Every route except /login and /onboarding sat directly inside <Layout/>
// with no auth check of its own. A signed-out visitor who had, say, a
// bookmarked or shared link straight to /site/dest_landmarks_01, or
// /itinerary, or /favorites, landed right on that screen - the screen's
// own data-fetching calls would then fail quietly (api/client.js only
// attaches a token when one exists; the backend would reject the
// unauthenticated request), leaving a broken-looking page instead of
// being sent to log in first, as the flow is supposed to work.
//
// WHAT THIS DOES
// ---------------
// Wrap any route that requires a signed-in, onboarded user:
//
//   <Route path="/site/:id" element={
//     <ProtectedRoute><SiteDetail /></ProtectedRoute>
//   } />
//
//   - No token / getMe() came back invalid -> redirect to /login,
//     remembering where they were headed (so Login can send them back
//     afterwards instead of dumping them on /destinations regardless).
//   - Logged in but useAuth()'s hasOnboarded is false (a real check
//     against GET /recommendations/preferences, not a guess - see
//     auth.jsx) -> redirect to /onboarding first.
//   - hasOnboarded is null (still checking, or that one request hasn't
//     resolved yet) -> show the loading state rather than bouncing
//     somewhere wrong based on incomplete information.
//
// /destinations itself is deliberately NOT wrapped in this (see App.jsx) -
// browsing the catalogue is meant to stay open to logged-out visitors,
// exactly as documented there. This only guards the screens that need an
// actual account.
// =============================================================================

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth";

function FullScreenSpinner({ label }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        color: "#64748b",
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          border: "3px solid rgba(100,116,139,0.25)",
          borderTopColor: "#0d9488",
          animation: "gt-spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes gt-spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

export function ProtectedRoute({ children, requireOnboarding = true }) {
  const { user, loading, hasOnboarded, connectionError } = useAuth();
  const location = useLocation();

  // Still resolving the very first auth check on this load (or a retry
  // after a transient failure - see auth.jsx). Don't redirect yet: doing
  // so based on "no user" while we're still finding out would bounce a
  // perfectly logged-in person to /login during every reload's brief
  // loading window.
  if (loading) {
    return <FullScreenSpinner label="Loading your session..." />;
  }

  if (!user) {
    // `state.from` lets Login send the person back to what they actually
    // asked for, instead of always landing on /destinations regardless
    // of what link they followed in.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (connectionError) {
    // We have a token and a previously-known user, but the last several
    // attempts to reach the server failed (see auth.jsx's retry logic).
    // Rather than pretend everything is fine or wrongly redirect to
    // /login (the session may well still be valid), say so plainly and
    // let the person retry.
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          textAlign: "center",
          color: "#64748b",
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: "#334155" }}>
          Can't reach the server right now
        </span>
        <span style={{ fontSize: 13.5, maxWidth: 320 }}>
          Your session is fine - we just can't confirm it at the moment. Check your
          connection and try again.
        </span>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 6,
            padding: "10px 18px",
            borderRadius: 999,
            border: "none",
            background: "#0d9488",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13.5,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // hasOnboarded is null while that one check is still in flight - wait
  // for a real answer rather than guessing which way to redirect.
  if (requireOnboarding && hasOnboarded === null) {
    return <FullScreenSpinner label="Just a moment..." />;
  }

  if (requireOnboarding && hasOnboarded === false) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}

export default ProtectedRoute;
