"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the open chat live like WhatsApp: starts at the newest message, scrolls down when new ones arrive,
 * and checks for new messages every 8 seconds while the tab is open (not while you are typing a reply).
 */
export default function ChatLive({ count, children }: { count: number; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [count]);
  useEffect(() => {
    const t = setInterval(() => {
      const typing = document.activeElement instanceof HTMLTextAreaElement && document.activeElement.value.trim();
      if (document.visibilityState === "visible" && !typing) router.refresh();
    }, 8000);
    return () => clearInterval(t);
  }, [router]);
  return <div ref={box} className="wa-msgs" aria-live="polite">{children}</div>;
}
