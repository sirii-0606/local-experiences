import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import type { WeatherHour } from "./api";

// The demo clock (every engine call's "now") and the live weather for that hour, shared by pages.
type Clock = { clock: string; setClock(v: string): void; live: WeatherHour | null | "offline" };
const ClockCtx = createContext<Clock | null>(null);

export function ClockProvider({ children }: { children: ReactNode }) {
  const [clock, setClock] = useState("2026-09-26T15:30");
  const [live, setLive] = useState<WeatherHour | null | "offline">(null);
  useEffect(() => {
    api.weather(`${clock}:00`).then((w) => setLive(w.available ? w.hour : "offline")).catch(() => setLive("offline"));
  }, [clock]);
  return <ClockCtx.Provider value={{ clock, setClock, live }}>{children}</ClockCtx.Provider>;
}

export function useClock(): Clock {
  const c = useContext(ClockCtx);
  if (!c) throw new Error("useClock outside ClockProvider");
  return c;
}
