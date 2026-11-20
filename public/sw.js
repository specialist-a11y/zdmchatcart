/* ZDM ChatCart service worker: shows browser notifications for new WhatsApp messages, even when ChatCart is closed. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || "New message";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "/brand/zdm-chatcart-icon-1024.png",
    badge: "/brand/zdm-chatcart-icon-1024.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || "/dashboard" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { await c.focus(); if ("navigate" in c) return c.navigate(url); return; }
    }
    return self.clients.openWindow(url);
  })());
});
