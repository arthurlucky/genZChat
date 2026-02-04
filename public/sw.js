self.addEventListener('push', function(event) {
    const data = event.data.json();
    console.log('Push Recieved', data);

    const options = {
        body: data.body,
        icon: '/images/logo.png', // Pastikan logo ada
        badge: '/images/logo.png',
        vibrate: [100, 50, 100],
        data: { url: data.url }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({type: 'window'}).then( windowClients => {
            for (var i = 0; i < windowClients.length; i++) {
                var client = windowClients[i];
                if (client.url === event.notification.data.url && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data.url);
            }
        })
    );
});