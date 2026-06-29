/**
 * Attache service worker — web push display (VS-6).
 */
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {
    title: "Attache",
    body: "New alert",
    url: "/app/notifications",
  };
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Attache", {
      body: data.body ?? "",
      data: { url: data.url ?? "/app/notifications" },
      tag: data.id ?? "attache-alert",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/app/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
