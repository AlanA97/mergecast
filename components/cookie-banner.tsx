'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const CONSENT_KEY = 'mergecast_cookie_consent';

// useSyncExternalStore lets React reconcile localStorage (client-only) with SSR
// without a hydration mismatch. The server snapshot is non-null so the banner is
// excluded from the initial HTML; the client snapshot reads the real value after
// hydration. Storage events keep the snapshot fresh across tabs.
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

export function CookieBanner() {
  const consent = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(CONSENT_KEY),  // client: read real value
    () => CONSENT_KEY,                         // server: return non-null → banner hidden in SSR HTML
  );

  // Banner is hidden once consent has been recorded (any non-null value)
  if (consent !== null) return null;

  function handleAccept() {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    window.dispatchEvent(new StorageEvent('storage'));
  }

  function handleDecline() {
    localStorage.setItem(CONSENT_KEY, 'declined');
    window.dispatchEvent(new StorageEvent('storage'));
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background px-6 py-4">
      <div className="max-w-5xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We use cookies to keep you signed in and remember your preferences. No tracking or
          advertising cookies.{' '}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            Privacy Policy
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={handleDecline}>
            Decline
          </Button>
          <Button size="sm" onClick={handleAccept}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
