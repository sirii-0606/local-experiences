import { useState } from "react";
import type { Member } from "./api";

// Group mode (doc §5.3): the engine unions hard constraints (age, accessibility) across members
// and scores soft interests fairly (0.7·mean + 0.3·min), so nobody gets a day they hate.
export default function GroupEditor({ group, tags, busy, onApply }: {
  group: Member[]; tags: string[]; busy: boolean; onApply: (g: Member[]) => void;
}) {
  const [rows, setRows] = useState(() => group.map((m) => ({ ...m, text: m.interests.join(", ") })));
  const edit = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const known = new Set(tags);

  const apply = () => onApply(rows.map(({ text, ...m }) => ({
    ...m,
    interests: text.split(",").map((t) => t.trim().toLowerCase()).filter((t) => known.has(t)),
  })));

  return (
    <details className="group-editor">
      <summary>Edit group ({group.length})</summary>
      <datalist id="tag-list">{tags.map((t) => <option key={t} value={t} />)}</datalist>
      {rows.map((r, i) => (
        <div key={i} className="member">
          <input aria-label="Name" value={r.name} onChange={(e) => edit(i, { name: e.target.value })} />
          <input aria-label="Age" type="number" min={0} max={110} value={r.age} onChange={(e) => edit(i, { age: Number(e.target.value) })} />
          <input aria-label="Interests" list="tag-list" placeholder="interests, e.g. craft, wildlife" value={r.text} onChange={(e) => edit(i, { text: e.target.value })} />
          <label className="check" title="Needs wheelchair access">
            <input type="checkbox" checked={r.accessibility.includes("wheelchair")}
              onChange={(e) => edit(i, { accessibility: e.target.checked ? [...r.accessibility, "wheelchair"] : r.accessibility.filter((a) => a !== "wheelchair") })} />♿
          </label>
          <button type="button" className="icon" aria-label={`Remove ${r.name}`} disabled={rows.length === 1}
            onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div className="row">
        <button type="button" className="secondary" onClick={() => setRows((rs) => [...rs, { name: `person${rs.length + 1}`, age: 30, interests: [], accessibility: [], text: "" }])}>+ Add person</button>
        <button type="button" disabled={busy} onClick={apply}>Update group</button>
      </div>
    </details>
  );
}
