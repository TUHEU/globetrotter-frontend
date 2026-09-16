// =============================================================================
// AdminActivity.jsx  -  "HOW MANY USERS DO WE HAVE, AND WHAT'S BEEN HAPPENING"
//
// WHAT THIS SCREEN IS
// --------------------
// Two things an admin genuinely wants to see at a glance: the total number
// of travellers who've signed up, and a feed of what's happened recently
// (comments, place create/edit/delete requests, new places added).
//
// WHAT'S HONEST ABOUT THIS DATA, AND WHAT ISN'T HERE ON PURPOSE
// -----------------------------------------------------------------
// Every number and event here comes from a real, existing field:
//   - total_users / by_role / recent_signups   <- User Service's users table
//   - comments, place requests, newly-created
//     places                                    <- Itinerary Service
//
// Ratings and likes are NOT in the activity feed. They're stored as
// {destination_id: {user_id: value}} with no record of WHEN each one
// happened (see itinerary-service/app/social.py) - showing them here would
// mean inventing timestamps that were never recorded. Accounts created
// before this feature existed have no signup date either; they're still
// counted in the totals, just left out of "recent signups" rather than
// given a made-up date.
// =============================================================================

import React, { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Users, MessageSquare, MapPinPlus, Clock, ShieldCheck, RefreshCw, AlertTriangle,
} from "lucide-react";
import { api } from "../api/client";
import { useTheme } from "../theme";
import { useAuth } from "../auth";

const EVENT_LABELS = {
  comment: { label: "New comment", icon: MessageSquare, color: "#5eead4" },
  place_created: { label: "Place added", icon: MapPinPlus, color: "#22c55e" },
  place_create_request: { label: "Suggested a new place", icon: MapPinPlus, color: "#eab308" },
  place_update_request: { label: "Suggested an edit", icon: MapPinPlus, color: "#eab308" },
  place_delete_request: { label: "Suggested a removal", icon: MapPinPlus, color: "#ef4444" },
};

function timeAgo(isoString) {
  const then = new Date(isoString).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AdminActivityScreen() {
  const { theme } = useTheme();
  const { isAdmin, loading: authLoading } = useAuth();
  const [userStats, setUserStats] = useState(null);
  const [activity, setActivity] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [stats, feed] = await Promise.all([
        api.getUserStats(10),
        api.getDestinationActivity(30),
      ]);
      setUserStats(stats);
      setActivity(feed);
      setError("");
    } catch {
      setError("Couldn't load activity data. Are you signed in as an admin?");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // ADMIN ONLY - same pattern as Metrics.jsx: the backend already rejects a
  // non-admin's token with 403, but redirecting client-side avoids a flash
  // of error text for someone who was never going to see this anyway.
  if (!authLoading && !isAdmin) {
    return <Navigate to="/destinations" replace />;
  }

  const headlineStats = userStats
    ? [
        { label: "Total users", value: userStats.total_users, icon: Users, color: "#5eead4" },
        { label: "Admins", value: userStats.by_role?.admin || 0, icon: ShieldCheck, color: "#a78bfa" },
        { label: "Travellers", value: userStats.by_role?.user || 0, icon: Users, color: "#22c55e" },
        {
          label: "Pending requests",
          value: activity?.pending_requests ?? "-",
          icon: Clock,
          color: activity?.pending_requests > 0 ? "#eab308" : "#22c55e",
        },
      ]
    : [];

  return (
    <div className="gt-page" style={{ background: theme.bg }}>
      <div className="gt-container" style={{ paddingTop: 22, paddingBottom: 40 }}>

        {/* ---- header ---- */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontFamily: "'Fraunces',serif", fontWeight: 600, fontSize: "clamp(22px, 2.8vw, 28px)", color: theme.text, margin: 0 }}>
              Activity & Users
            </h1>
            <p style={{ fontSize: 12.5, color: theme.subtext, margin: "3px 0 0" }}>
              Who's using the app, and what's happened recently
            </p>
          </div>
          <button
            onClick={handleRefresh}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 999, border: `1px solid ${theme.border}`, background: "transparent", color: theme.text, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
          >
            <RefreshCw size={13} className={refreshing ? "gt-spin" : ""} />
            Refresh
          </button>
        </div>

        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 16, padding: "13px 15px", fontSize: 13, color: theme.text, marginBottom: 16 }}>
            <AlertTriangle size={15} />
            {error}
          </div>
        )}

        {/* ---- headline numbers ---- */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 12, marginBottom: 18 }}>
          {headlineStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} style={{ background: theme.card, backdropFilter: "blur(16px)", border: `1px solid ${theme.border}`, borderRadius: 20, padding: "15px 16px" }}>
                <Icon size={17} color={stat.color} style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 21, fontWeight: 800, color: theme.text, lineHeight: 1.1 }}>{stat.value}</div>
                <div style={{ fontSize: 11, color: theme.subtext, marginTop: 3 }}>{stat.label}</div>
              </div>
            );
          })}
        </div>

        {/* ---- app-wide totals ---- */}
        {activity && (
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 20, padding: "14px 16px", marginBottom: 18, fontSize: 12.5, color: theme.subtext }}>
            <span><strong style={{ color: theme.text }}>{activity.total_destinations}</strong> places</span>
            <span><strong style={{ color: theme.text }}>{activity.total_itineraries}</strong> itineraries</span>
            <span><strong style={{ color: theme.text }}>{activity.total_comments}</strong> comments</span>
            <span><strong style={{ color: theme.text }}>{activity.total_requests}</strong> place requests total</span>
          </div>
        )}

        {/* ---- recent signups ---- */}
        {userStats?.recent_signups?.length > 0 && (
          <div style={{ background: theme.card, backdropFilter: "blur(16px)", border: `1px solid ${theme.border}`, borderRadius: 20, padding: "16px 17px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: theme.text, marginBottom: 10 }}>Recent signups</div>
            {userStats.recent_signups.map((u) => (
              <div key={u.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: `1px solid ${theme.border}`, fontSize: 12.5 }}>
                <span style={{ color: theme.text, fontWeight: 600 }}>{u.name}</span>
                <span style={{ color: theme.subtext }}>{timeAgo(u.created_at)}</span>
              </div>
            ))}
            {userStats.accounts_missing_signup_date > 0 && (
              <p style={{ fontSize: 11, color: theme.subtext, margin: "10px 0 0" }}>
                +{userStats.accounts_missing_signup_date} older account(s) with no recorded signup date.
              </p>
            )}
          </div>
        )}

        {/* ---- activity feed ---- */}
        <div style={{ background: theme.card, backdropFilter: "blur(16px)", border: `1px solid ${theme.border}`, borderRadius: 20, padding: "16px 17px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: theme.text, marginBottom: 4 }}>Recent activity</div>
          <p style={{ fontSize: 11, color: theme.subtext, margin: "0 0 12px", lineHeight: 1.5 }}>
            Comments, place suggestions, and newly added places - the events that have a recorded time.
          </p>

          {activity?.events?.length ? (
            activity.events.map((event, idx) => {
              const meta = EVENT_LABELS[event.type] || { label: event.type, icon: Clock, color: theme.subtext };
              const Icon = meta.icon;
              return (
                <div
                  key={`${event.type}-${event.destination_id}-${event.created_at}-${idx}`}
                  style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0", borderTop: idx === 0 ? "none" : `1px solid ${theme.border}` }}
                >
                  <Icon size={15} color={meta.color} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: theme.text, fontWeight: 600 }}>
                      {meta.label}
                      {event.status ? ` · ${event.status}` : ""}
                    </div>
                    {event.text && (
                      <div style={{ fontSize: 12, color: theme.subtext, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        "{event.text}"
                      </div>
                    )}
                    {event.name && (
                      <div style={{ fontSize: 12, color: theme.subtext, marginTop: 2 }}>{event.name}</div>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: theme.subtext, flexShrink: 0 }}>{timeAgo(event.created_at)}</span>
                </div>
              );
            })
          ) : (
            <p style={{ fontSize: 12.5, color: theme.subtext, margin: 0 }}>No activity recorded yet.</p>
          )}
        </div>

      </div>
    </div>
  );
}
