import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import AuthorizeForm from "./AuthorizeForm";

interface Props {
  searchParams: Promise<{
    client_id?: string;
    redirect_uri?: string;
    code_challenge?: string;
    code_challenge_method?: string;
    response_type?: string;
    state?: string;
    scope?: string;
  }>;
}

export default async function AuthorizePage({ searchParams }: Props) {
  const params = await searchParams;
  const {
    client_id,
    redirect_uri,
    code_challenge,
    code_challenge_method,
    response_type,
    state,
    scope,
  } = params;

  // Must be logged in (middleware handles redirect to /login)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Validate required params
  if (!client_id || !redirect_uri || !code_challenge || response_type !== "code") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
          <h1 className="text-lg font-semibold text-red-800">Invalid Request</h1>
          <p className="mt-2 text-sm text-red-600">
            Missing required OAuth parameters (client_id, redirect_uri, code_challenge, response_type=code).
          </p>
        </div>
      </div>
    );
  }

  // Validate client
  const admin = createAdminClient();
  const { data: client } = await admin
    .from("oauth_clients")
    .select("client_id, client_name, redirect_uris")
    .eq("client_id", client_id)
    .single();

  if (!client) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
          <h1 className="text-lg font-semibold text-red-800">Unknown Client</h1>
          <p className="mt-2 text-sm text-red-600">
            Client &quot;{client_id}&quot; is not registered.
          </p>
        </div>
      </div>
    );
  }

  // Validate redirect_uri
  if (!client.redirect_uris.includes(redirect_uri)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
          <h1 className="text-lg font-semibold text-red-800">Invalid Redirect</h1>
          <p className="mt-2 text-sm text-red-600">
            The redirect URI does not match any registered for this client.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Authorize Access</h1>
        <p className="mt-2 text-sm text-gray-600">
          <span className="font-medium text-gray-900">
            {client.client_name || "An MCP client"}
          </span>{" "}
          wants to access your Room Service gallery data.
        </p>

        <div className="mt-4 rounded-lg bg-gray-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            This will allow read access to:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-gray-700">
            <li>Search artworks, artists, contacts, and prospects</li>
            <li>View record details and enrichment data</li>
            <li>Find matches and similar artworks</li>
            <li>View aggregate statistics</li>
          </ul>
        </div>

        <AuthorizeForm
          clientId={client_id}
          redirectUri={redirect_uri}
          codeChallenge={code_challenge}
          codeChallengeMethod={code_challenge_method || "S256"}
          state={state || ""}
          scope={scope || ""}
        />
      </div>
    </div>
  );
}
