"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.replace(params.get("next") || "/");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-surface border border-hairline rounded-xl p-8 w-full max-w-sm shadow-sm"
    >
      <h1 className="text-lg font-semibold text-ink-primary mb-1">POD Task Dashboard</h1>
      <p className="text-sm text-ink-secondary mb-6">Enter the shared password to continue.</p>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoFocus
        className="w-full border border-hairline rounded-lg px-3 py-2 mb-3 text-ink-primary bg-transparent outline-none focus:border-series-1"
      />
      {error && <p className="text-sm text-status-critical mb-3">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-series-1 text-white rounded-lg py-2 font-medium disabled:opacity-60"
      >
        {loading ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-plane">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
