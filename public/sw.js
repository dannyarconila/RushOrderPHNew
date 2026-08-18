self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data = {};

  try {
    data = event.data.json();
  } catch {
    data = {
      title: "RushOrder PH",
      body: event.data.text(),
    };
  }

  const title = data.title || "RushOrder PH";
  const options = {
    body: data.body || "You have a new notification.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: {
      action_url: data.action_url || "/",
    },
    tag: data.tag || "rushorder-notification",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const actionUrl = event.notification.data?.action_url || "/";

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(actionUrl);
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(actionUrl);
        }

        return undefined;
      }),
  );
});
