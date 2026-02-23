# Supabase Email Templates

Copy each template into **Supabase Dashboard > Authentication > Email Templates**.

For each template, paste the **Subject** and **Body (HTML)** into the corresponding fields.

> **Important:** In the Supabase Dashboard, make sure your **Site URL** is set to `https://roomservice-tools.vercel.app` under **Authentication > URL Configuration**.
>
> Also add both `https://roomservice-tools.vercel.app/**` and `http://localhost:3002/**` to the **Redirect URLs** allowlist.

---

## 1. Invite User

**Subject:** `You've been invited to Room Service`

**Body:**

```html
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center" style="padding:40px 20px;">
      <table width="460" border="0" cellspacing="0" cellpadding="0" style="background-color:#ffffff;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr>
          <td align="center" style="padding:36px 40px 0;">
            <div style="font-size:20px;font-weight:700;color:#1e1b4b;letter-spacing:-0.3px;">Room Service</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 40px 12px;">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111827;letter-spacing:-0.3px;">You're invited</h1>
            <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#6b7280;">
              You've been invited to join <strong style="color:#111827;">Room Service</strong>, an AI-powered companion for gallery management. Click below to set up your account.
            </p>
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center">
                  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password"
                     style="display:inline-block;background-color:#4f46e5;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;letter-spacing:0.01em;">
                    Accept Invite
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px 36px;">
            <div style="border-top:1px solid #f1f5f9;padding-top:20px;">
              <p style="margin:0;font-size:12px;line-height:18px;color:#9ca3af;">
                If you weren't expecting this invitation, you can safely ignore this email.
              </p>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

---

## 2. Confirm Sign Up

**Subject:** `Confirm your Room Service account`

**Body:**

```html
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center" style="padding:40px 20px;">
      <table width="460" border="0" cellspacing="0" cellpadding="0" style="background-color:#ffffff;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr>
          <td align="center" style="padding:36px 40px 0;">
            <div style="font-size:20px;font-weight:700;color:#1e1b4b;letter-spacing:-0.3px;">Room Service</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px 12px;">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111827;letter-spacing:-0.3px;">Confirm your email</h1>
            <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#6b7280;">
              Thanks for signing up. Please confirm your email address to get started.
            </p>
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center">
                  <a href="{{ .ConfirmationURL }}"
                     style="display:inline-block;background-color:#4f46e5;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;letter-spacing:0.01em;">
                    Confirm Email
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px 36px;">
            <div style="border-top:1px solid #f1f5f9;padding-top:20px;">
              <p style="margin:0;font-size:12px;line-height:18px;color:#9ca3af;">
                If you didn't create an account, you can safely ignore this email.
              </p>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

---

## 3. Reset Password

**Subject:** `Reset your Room Service password`

**Body:**

```html
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center" style="padding:40px 20px;">
      <table width="460" border="0" cellspacing="0" cellpadding="0" style="background-color:#ffffff;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr>
          <td align="center" style="padding:36px 40px 0;">
            <div style="font-size:20px;font-weight:700;color:#1e1b4b;letter-spacing:-0.3px;">Room Service</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px 12px;">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111827;letter-spacing:-0.3px;">Reset your password</h1>
            <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#6b7280;">
              We received a request to reset your password. Click the button below to choose a new one.
            </p>
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center">
                  <a href="{{ .ConfirmationURL }}"
                     style="display:inline-block;background-color:#4f46e5;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;letter-spacing:0.01em;">
                    Reset Password
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px 36px;">
            <div style="border-top:1px solid #f1f5f9;padding-top:20px;">
              <p style="margin:0;font-size:12px;line-height:18px;color:#9ca3af;">
                If you didn't request a password reset, you can safely ignore this email. The link will expire in 24 hours.
              </p>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

---

## 4. Magic Link

**Subject:** `Your Room Service sign-in link`

**Body:**

```html
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center" style="padding:40px 20px;">
      <table width="460" border="0" cellspacing="0" cellpadding="0" style="background-color:#ffffff;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr>
          <td align="center" style="padding:36px 40px 0;">
            <div style="font-size:20px;font-weight:700;color:#1e1b4b;letter-spacing:-0.3px;">Room Service</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px 12px;">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111827;letter-spacing:-0.3px;">Sign in to Room Service</h1>
            <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#6b7280;">
              Click the button below to sign in. This link is single-use and will expire shortly.
            </p>
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center">
                  <a href="{{ .ConfirmationURL }}"
                     style="display:inline-block;background-color:#4f46e5;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;letter-spacing:0.01em;">
                    Sign In
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px 36px;">
            <div style="border-top:1px solid #f1f5f9;padding-top:20px;">
              <p style="margin:0;font-size:12px;line-height:18px;color:#9ca3af;">
                If you didn't request this link, you can safely ignore this email.
              </p>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

---

## 5. Change Email

**Subject:** `Confirm your new email address`

**Body:**

```html
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center" style="padding:40px 20px;">
      <table width="460" border="0" cellspacing="0" cellpadding="0" style="background-color:#ffffff;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr>
          <td align="center" style="padding:36px 40px 0;">
            <div style="font-size:20px;font-weight:700;color:#1e1b4b;letter-spacing:-0.3px;">Room Service</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px 12px;">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111827;letter-spacing:-0.3px;">Confirm email change</h1>
            <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#6b7280;">
              You requested to change your email address. Click below to confirm this change.
            </p>
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center">
                  <a href="{{ .ConfirmationURL }}"
                     style="display:inline-block;background-color:#4f46e5;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;letter-spacing:0.01em;">
                    Confirm New Email
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px 36px;">
            <div style="border-top:1px solid #f1f5f9;padding-top:20px;">
              <p style="margin:0;font-size:12px;line-height:18px;color:#9ca3af;">
                If you didn't request this change, please secure your account immediately.
              </p>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

---

## 6. Reauthentication

**Subject:** `Verify your identity — Room Service`

**Body:**

```html
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center" style="padding:40px 20px;">
      <table width="460" border="0" cellspacing="0" cellpadding="0" style="background-color:#ffffff;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr>
          <td align="center" style="padding:36px 40px 0;">
            <div style="font-size:20px;font-weight:700;color:#1e1b4b;letter-spacing:-0.3px;">Room Service</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px 12px;">
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111827;letter-spacing:-0.3px;">Verify your identity</h1>
            <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#6b7280;">
              A sensitive action was requested on your account. Please verify your identity to proceed.
            </p>
            <table width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center">
                  <a href="{{ .ConfirmationURL }}"
                     style="display:inline-block;background-color:#4f46e5;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;letter-spacing:0.01em;">
                    Verify Identity
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px 36px;">
            <div style="border-top:1px solid #f1f5f9;padding-top:20px;">
              <p style="margin:0;font-size:12px;line-height:18px;color:#9ca3af;">
                If you didn't initiate this action, please secure your account immediately.
              </p>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

---

## Setup Checklist

1. Go to **Supabase Dashboard > Authentication > Email Templates**
2. For each of the 6 templates above, paste the Subject and HTML body
3. Go to **Authentication > URL Configuration**:
   - Set **Site URL** to `https://roomservice-tools.vercel.app`
   - Add these to **Redirect URLs**:
     - `https://roomservice-tools.vercel.app/**`
     - `http://localhost:3002/**`
4. **Test** by inviting a new user from the admin panel

> **Note:** The Invite User template uses `{{ .TokenHash }}` (server-side token exchange) instead of `{{ .ConfirmationURL }}` (client-side hash fragment). This is required for the SSR confirm callback at `/auth/confirm` to work properly.
