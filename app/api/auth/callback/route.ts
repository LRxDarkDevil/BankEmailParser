import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${error}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/?error=missing_code", request.url));
  }

  const client_id = process.env.GOOGLE_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET;
  const redirect_uri = process.env.NEXT_PUBLIC_REDIRECT_URI;

  if (!client_id || !client_secret || !redirect_uri) {
    return NextResponse.json(
      { error: "Google OAuth credentials are missing in env files" },
      { status: 500 }
    );
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uri
    );

    const { tokens } = await oauth2Client.getToken(code);

    // Redirect to dashboard and save tokens in cookies
    const response = NextResponse.redirect(new URL("/dashboard", request.url));

    const host = request.headers.get("host") || "";
    const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
    const isSecure = !isLocalhost && process.env.NODE_ENV === "production";

    if (tokens.access_token) {
      response.cookies.set("gmail_access_token", tokens.access_token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
        maxAge: 3600, // 1 hour is standard Google access token lifespan
        path: "/",
      });
    }

    if (tokens.refresh_token) {
      response.cookies.set("gmail_refresh_token", tokens.refresh_token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: "/",
      });
    }

    return response;
  } catch (err: any) {
    console.error("Error exchanging code:", err);
    return NextResponse.redirect(new URL(`/?error=exchange_failed&msg=${encodeURIComponent(err.message || "")}`, request.url));
  }
}
