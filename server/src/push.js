import webpush from "web-push";
import { get, all, run } from "./db.js";

export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

const enabled = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (enabled) {
  webpush.setVapidDetails("mailto:admin@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export async function saveSubscription(userId, subscription) {
  await run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
  );
}

export async function removeSubscription(endpoint) {
  await run("DELETE FROM push_subscriptions WHERE endpoint = ?", [endpoint]);
}

// Manda uma notificação push pra todos os dispositivos inscritos de um usuário.
// Não faz nada se o servidor não tiver chaves VAPID configuradas.
export async function pushToUser(userId, payload) {
  if (!enabled) return;
  const subs = await all("SELECT * FROM push_subscriptions WHERE user_id = ?", [userId]);
  for (const sub of subs) {
    const pushSub = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };
    try {
      await webpush.sendNotification(pushSub, JSON.stringify(payload));
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await removeSubscription(sub.endpoint);
      }
    }
  }
}
