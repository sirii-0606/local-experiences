import { useEffect, useState } from "react";
import ProviderView from "../ProviderView";
import { api } from "../api";
import type { Catalog } from "../api";
import { useClock } from "../clock";

export default function ProviderPage() {
  const { clock } = useClock();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const load = () => api.catalog().then(setCatalog);
  useEffect(() => { load(); }, []);
  return <ProviderView catalog={catalog} clock={clock} onChanged={load} />;
}
