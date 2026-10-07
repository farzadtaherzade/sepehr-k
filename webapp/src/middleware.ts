import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'evm_session';
const PUBLIC_PATHS = ['/login', '/api/auth/login'];

async function hasValidSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const s = process.env.AUTH_SECRET;
  if (!s) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(s));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = await hasValidSession(req);

  if (pathname === '/login') {
    if (authed) {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  if (!authed) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // everything except Next internals and static assets
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|woff2?)$).*)',
  ],
};
