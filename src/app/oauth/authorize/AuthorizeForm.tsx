"use client";

import { useState } from "react";

interface Props {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  scope: string;
}

export default function AuthorizeForm({
  clientId,
  redirectUri,
  codeChallenge,
  codeChallengeMethod,
  state,
  scope,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    // Submit as form to get the redirect
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/oauth/callback";

    const fields = {
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      state,
      scope,
    };

    for (const [key, value] of Object.entries(fields)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value;
      form.appendChild(input);
    }

    document.body.appendChild(form);
    form.submit();
  }

  function handleDeny() {
    const url = new URL(redirectUri);
    url.searchParams.set("error", "access_denied");
    if (state) url.searchParams.set("state", state);
    window.location.href = url.toString();
  }

  return (
    <div className="mt-6 flex gap-3">
      <button
        onClick={handleDeny}
        disabled={loading}
        className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        Deny
      </button>
      <button
        onClick={handleApprove}
        disabled={loading}
        className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Authorizing..." : "Approve"}
      </button>
    </div>
  );
}
