import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Allow login page without auth
  if (request.nextUrl.pathname === "/login") {
    if (user) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return supabaseResponse;
  }

  // Allow home page without auth (shows landing page)
  if (request.nextUrl.pathname === "/") {
    return supabaseResponse;
  }

  // Allow auth confirm callback (invite token exchange) without auth
  if (request.nextUrl.pathname === "/auth/confirm") {
    return supabaseResponse;
  }

  // Redirect to landing page if not authenticated
  if (!user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Allow set-password page (invited users who haven't set a password yet)
  const pathname = request.nextUrl.pathname;
  if (pathname === "/set-password") {
    return supabaseResponse;
  }

  // Check MFA assurance level
  const isOnMfaSetup = pathname === "/mfa/setup";
  const isOnMfaVerify = pathname === "/mfa/verify";

  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aalData) {
    const { currentLevel, nextLevel } = aalData;

    // User has no MFA enrolled — force setup (unless already on setup page)
    if (nextLevel === "aal1" && !isOnMfaSetup) {
      return NextResponse.redirect(new URL("/mfa/setup", request.url));
    }

    // User has MFA enrolled but hasn't verified this session — force verify
    if (currentLevel === "aal1" && nextLevel === "aal2" && !isOnMfaVerify) {
      return NextResponse.redirect(new URL("/mfa/verify", request.url));
    }

    // User is on MFA pages but already verified (or no MFA needed after setup)
    if ((isOnMfaSetup || isOnMfaVerify) && currentLevel === "aal2") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/trigger|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.ico$).*)"],
};
