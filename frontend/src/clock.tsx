import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import type { WeatherHour } from "./api";

// The demo clock (every engine call's "now") and the live weather for that hour, shared by pages.
type Clock = { clock: string; setClock(v: string): void; live: WeatherHour | null | "offline" };
const ClockCtx = createContext<Clock | null>(null);

export function ClockProvider({ children }: { children: ReactNode }) {
  // Starts at the real current time (local); change it to replay any moment in a demo.
  const [clock, setClock] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [live, setLive] = useState<WeatherHour | null | "offline">(null);
  useEffect(() => {
    if (!clock || clock.length < 10) return;
    const iso = clock.includes("T") && clock.split("T")[1].split(":").length === 2 ? `${clock}:00` : clock;
    api.weather(iso)
      .then((w) => setLive(w.available && w.hour ? w.hour : "offline"))
      .catch(() => setLive("offline"));
  }, [clock]);
  return <ClockCtx.Provider value={{ clock, setClock, live }}>{children}</ClockCtx.Provider>;
}

export function useClock(): Clock {
  const c = useContext(ClockCtx);
  if (!c) throw new Error("useClock outside ClockProvider");
  return c;
}
