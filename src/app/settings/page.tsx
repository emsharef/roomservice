"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type PageState = "loading" | "enrolled" | "confirming" | "re_enrolling";

export default function SettingsPage() {
  const [state, setState] = useState<PageState>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [newQrCode, setNewQrCode] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [newFactorId, setNewFactorId] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const confirmRef = useRef<HTMLInputElement>(null);
  const setupRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    const { data } = await supabase.auth.mfa.listFactors();
    if (data) {
      const totp = data.totp.find((f) => f.status === "verified");
      if (totp) {
        setFactorId(totp.id);
        setState("enrolled");
        return;
      }
    }
    // If no verified factor, user shouldn't be here (middleware redirects to /mfa/setup)
    // but handle gracefully
    setState("enrolled");
  }

  async function handleStartReEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || confirmCode.length !== 6) return;
    setError(null);
    setLoading(true);

    // Verify identity with current TOTP code
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: confirmCode,
    });

    if (verifyError) {
      setError(verifyError.message);
      setConfirmCode("");
      setLoading(false);
      confirmRef.current?.focus();
      return;
    }

    // Unenroll old factor
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({
      factorId,
    });

    if (unenrollError) {
      setError(unenrollError.message);
      setLoading(false);
      return;
    }

    // Enroll new factor
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Authenticator App",
    });

    if (enrollError || !data) {
      setError(enrollError?.message || "Failed to start enrollment");
      setLoading(false);
      return;
    }

    setNewFactorId(data.id);
    setNewQrCode(data.totp.qr_code);
    setNewSecret(data.totp.secret);
    setConfirmCode("");
    setLoading(false);
    setState("re_enrolling");
    setTimeout(() => setupRef.current?.focus(), 100);
  }

  async function handleCompleteReEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!newFactorId || setupCode.length !== 6) return;
    setError(null);
    setLoading(true);

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: newFactorId,
      code: setupCode,
    });

    if (verifyError) {
      setError(verifyError.message);
      setSetupCode("");
      setLoading(false);
      setupRef.current?.focus();
      return;
    }

    setFactorId(newFactorId);
    setNewFactorId(null);
    setNewQrCode("");
    setNewSecret("");
    setSetupCode("");
    setLoading(false);
    setSuccess("Two-factor authentication has been set up on your new device.");
    setState("enrolled");
  }

  function handleCopySecret() {
    navigator.clipboard.writeText(newSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCancelReEnroll() {
    // Clean up the unverified new factor
    if (newFactorId) {
      supabase.auth.mfa.unenroll({ factorId: newFactorId });
    }
    setNewFactorId(null);
    setNewQrCode("");
    setNewSecret("");
    setSetupCode("");
    setError(null);
    setState("enrolled");
    // Note: the old factor was already unenrolled, so user will be redirected to /mfa/setup by middleware
    // This is actually the desired behavior — they must set up MFA again
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account security.
        </p>
      </div>

      <div className="max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Two-Factor Authentication
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 border border-green-200">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Enabled
          </span>
        </div>

        {success && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700 mb-4">
            {success}
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4">
            {error}
          </div>
        )}

        {state === "loading" && (
          <p className="text-sm text-gray-500">Loading...</p>
        )}

        {state === "enrolled" && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Your account is protected with an authenticator app. If you need
              to switch to a new device, you can re-enroll below.
            </p>
            <button
              onClick={() => {
                setState("confirming");
                setError(null);
                setSuccess(null);
                setTimeout(() => confirmRef.current?.focus(), 100);
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
            >
              Set up new device
            </button>
          </div>
        )}

        {state === "confirming" && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Enter your current authenticator code to confirm your identity
              before switching devices.
            </p>
            <form onSubmit={handleStartReEnroll} className="space-y-3">
              <input
                ref={confirmRef}
                type="text"
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]*"
                autoComplete="one-time-code"
                required
                value={confirmCode}
                onChange={(e) =>
                  setConfirmCode(e.target.value.replace(/\D/g, ""))
                }
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-center tracking-[0.3em] font-mono shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="000000"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading || confirmCode.length !== 6}
                  className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                >
                  {loading ? "Verifying..." : "Continue"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setState("enrolled");
                    setConfirmCode("");
                    setError(null);
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {state === "re_enrolling" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Scan this QR code with your new authenticator app.
            </p>

            <div className="flex justify-center">
              <div
                className="rounded-lg border border-gray-200 p-3"
                dangerouslySetInnerHTML={{ __html: newQrCode }}
              />
            </div>

            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1.5">
                Or enter this code manually:
              </p>
              <button
                onClick={handleCopySecret}
                className="inline-flex items-center gap-1.5 rounded-md bg-gray-50 px-3 py-1.5 font-mono text-xs text-gray-700 hover:bg-gray-100 transition-colors border border-gray-200"
              >
                {newSecret}
                <svg
                  className="h-3.5 w-3.5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                  />
                </svg>
              </button>
              {copied && (
                <p className="mt-1 text-xs text-green-600">Copied!</p>
              )}
            </div>

            <form onSubmit={handleCompleteReEnroll} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Verification code from new device
                </label>
                <input
                  ref={setupRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  required
                  value={setupCode}
                  onChange={(e) =>
                    setSetupCode(e.target.value.replace(/\D/g, ""))
                  }
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-center tracking-[0.3em] font-mono shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="000000"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading || setupCode.length !== 6}
                  className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                >
                  {loading ? "Verifying..." : "Verify & Activate"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelReEnroll}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <ChangePasswordSection />
    </div>
  );
}

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    setLoading(true);

    // Verify current password by re-authenticating
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      setError("Could not get current user");
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      setError("Current password is incorrect");
      setLoading(false);
      return;
    }

    // Update to new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSuccess("Password changed successfully.");
    setLoading(false);
  }

  return (
    <div className="max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-sm mt-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Change Password
      </h2>

      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700 mb-4">
          {success}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="current-password"
            className="block text-sm font-medium text-gray-700"
          >
            Current password
          </label>
          <input
            id="current-password"
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            autoComplete="current-password"
          />
        </div>

        <div>
          <label
            htmlFor="new-password"
            className="block text-sm font-medium text-gray-700"
          >
            New password
          </label>
          <input
            id="new-password"
            type="password"
            required
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="Min 6 characters"
            autoComplete="new-password"
          />
        </div>

        <div>
          <label
            htmlFor="confirm-new-password"
            className="block text-sm font-medium text-gray-700"
          >
            Confirm new password
          </label>
          <input
            id="confirm-new-password"
            type="password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="Re-enter new password"
            autoComplete="new-password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {loading ? "Changing password..." : "Change Password"}
        </button>
      </form>
    </div>
  );
}
