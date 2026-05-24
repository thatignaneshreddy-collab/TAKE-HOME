"use client";

import { useState, useEffect } from "react";

interface CountdownResult {
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isExpired: boolean;
  formattedTime: string;
  urgencyLevel: "normal" | "warning" | "critical";
}

/**
 * Counts down to a target datetime.
 * Updates every second.
 * Returns urgency levels for UI styling:
 *   normal   → > 5 minutes remaining
 *   warning  → 1–5 minutes remaining
 *   critical → < 1 minute remaining
 */
export function useCountdown(expiresAt: string | null): CountdownResult {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!expiresAt) {
    return {
      minutes: 0,
      seconds: 0,
      totalSeconds: 0,
      isExpired: true,
      formattedTime: "—",
      urgencyLevel: "critical",
    };
  }

  const diff = Math.floor((new Date(expiresAt).getTime() - now) / 1000);
  const totalSeconds = Math.max(0, diff);
  const isExpired = diff <= 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const formattedTime = isExpired
    ? "Expired"
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const urgencyLevel =
    totalSeconds > 300 ? "normal" : totalSeconds > 60 ? "warning" : "critical";

  return {
    minutes,
    seconds,
    totalSeconds,
    isExpired,
    formattedTime,
    urgencyLevel,
  };
}
