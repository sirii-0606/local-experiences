import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../auth";

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return { busy, error, submit };
}

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, submit } = useSubmit();
  return (
    <section className="page narrow">
      <form className="panel form" onSubmit={(e) => { e.preventDefault(); submit(async () => {
        await signIn(email, password);
        navigate(params.get("next") || "/explore");
      }); }}>
        <h2>Sign in</h2>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="muted small">New here? <Link to={`/register${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`}>Create an account</Link>.
          Forgot your password? Ask an admin to set a temporary one.</p>
      </form>
    </section>
  );
}

export function RegisterPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { busy, error, submit } = useSubmit();
  return (
    <section className="page narrow">
      <form className="panel form" onSubmit={(e) => { e.preventDefault(); submit(async () => {
        if (password !== confirm) throw new Error("passwords don't match");
        await signUp(email, password, name);
        navigate(params.get("next") || "/onboarding");
      }); }}>
        <h2>Create your account</h2>
        <label>Your name<input autoComplete="name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password <span className="muted small">(at least 8 characters)</span>
          <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label>Confirm password<input type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        <p className="muted small">Already have one? <Link to="/login">Sign in</Link>.</p>
      </form>
    </section>
  );
}
