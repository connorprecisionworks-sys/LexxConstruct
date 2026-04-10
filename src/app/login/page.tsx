"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

// Separated so the Suspense boundary wraps only the part that reads searchParams.
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Key trick: incrementing the key remounts the Input (restoring autoFocus) after an error.
  const [inputKey, setInputKey] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        const from = searchParams?.get("from") ?? "/";
        // Use replace so the login page doesn't appear in browser history
        router.replace(from);
      } else {
        setError("Invalid password");
        setPassword("");
        setInputKey((k) => k + 1); // remount Input → autoFocus fires again
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* Password input */}
      <div style={{ marginTop: "var(--space-6)" }}>
        <Input
          key={inputKey}
          type="password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          autoFocus
          disabled={loading}
        />
      </div>

      {/* Error */}
      {error && (
        <p
          role="alert"
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--color-danger)",
            marginTop: "var(--space-3)",
          }}
        >
          {error}
        </p>
      )}

      {/* Submit */}
      <div style={{ marginTop: "var(--space-6)" }}>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={loading}
          className="w-full"
        >
          {loading ? "Signing in…" : "Sign In"}
        </Button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--color-paper-sunken)",
        padding: "var(--space-6)",
      }}
    >
      {/* Card */}
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          backgroundColor: "var(--color-paper)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
          padding: "var(--space-10)",
        }}
      >
        {/* Logo */}
        <p
          style={{
            textAlign: "center",
            fontFamily: "var(--font-serif)",
            fontSize: "var(--text-3xl)",
            fontWeight: 600,
            color: "var(--color-teal)",
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}
        >
          Lexx
        </p>

        {/* Subtitle */}
        <p
          style={{
            textAlign: "center",
            fontFamily: "var(--font-sans, Inter, sans-serif)",
            fontSize: "var(--text-sm)",
            color: "var(--color-ink-subtle)",
            marginTop: "var(--space-2)",
          }}
        >
          Construction Litigation Intelligence
        </p>

        {/* Divider */}
        <div
          style={{
            height: "1px",
            backgroundColor: "var(--color-border-subtle)",
            margin: "var(--space-8) 0",
          }}
        />

        {/* Heading */}
        <h1
          style={{
            textAlign: "center",
            fontFamily: "var(--font-serif)",
            fontSize: "var(--text-xl)",
            fontWeight: 600,
            color: "var(--color-ink)",
          }}
        >
          Sign in
        </h1>

        {/* Description */}
        <p
          style={{
            textAlign: "center",
            fontSize: "var(--text-sm)",
            color: "var(--color-ink-muted)",
            marginTop: "var(--space-2)",
          }}
        >
          Enter the password to continue.
        </p>

        {/* Form — wrapped in Suspense because useSearchParams() requires it */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>

      {/* Version */}
      <p
        style={{
          marginTop: "var(--space-6)",
          fontSize: "var(--text-xs)",
          color: "var(--color-ink-faint)",
        }}
      >
        Lexx v1.0
      </p>
    </div>
  );
}
