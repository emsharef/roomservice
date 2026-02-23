"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function MFASetupPage() {
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(true);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    startEnrollment();
  }, []);

  async function startEnrollment() {
    // Clean up any stale unverified factors
    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    if (factorsData) {
      const unverified = factorsData.all.filter(
        (f) => f.factor_type === "totp" && (f.status as string) !== "verified"
      );
      for (const f of unverified) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }

    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator App",
    });

    if (enrollError || !data) {
      setError(enrollError?.message || "Failed to start enrollment");
      setEnrolling(false);
      return;
    }

    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setEnrolling(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || code.length !== 6) return;
    setError(null);
    setLoading(true);

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });

    if (verifyError) {
      setError(verifyError.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function handleCopySecret() {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img
            src="/logo.png"
            alt="Room Service"
            className="mx-auto mb-4 h-10"
          />
          <h1 className="text-lg font-semibold text-gray-900">
            Set Up Two-Factor Authentication
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Scan the QR code with your authenticator app
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {enrolling ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-gray-500">Setting up...</div>
            </div>
          ) : qrCode ? (
            <div className="space-y-5">
              <div className="flex justify-center">
                <div
                  className="rounded-lg border border-gray-200 p-3"
                  dangerouslySetInnerHTML={{ __html: qrCode }}
                />
              </div>

              <div className="text-center">
                <p className="text-xs text-gray-500 mb-1.5">
                  Or enter this code manually:
                </p>
                <button
                  onClick={handleCopySecret}
                  className="inline-flex items-center gap-1.5 rounded-md bg-gray-50 px-3 py-1.5 font-mono text-xs text-gray-700 hover:bg-gray-100 transition-colors border border-gray-200"
                  title="Click to copy"
                >
                  {secret}
                  <svg className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                  </svg>
                </button>
                {copied && (
                  <p className="mt-1 text-xs text-green-600">Copied!</p>
                )}
              </div>

              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <label
                    htmlFor="code"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Verification code
                  </label>
                  <input
                    ref={inputRef}
                    id="code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-center tracking-[0.3em] font-mono shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="000000"
                  />
                </div>

                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                >
                  {loading ? "Verifying..." : "Verify & Activate"}
                </button>
              </form>
            </div>
          ) : (
            <div className="text-center py-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4">
                  {error}
                </div>
              )}
              <button
                onClick={startEnrollment}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
