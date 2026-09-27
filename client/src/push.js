import { api } from "./api.js";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Pede permissão de notificação e inscreve esse dispositivo pra receber
// push mesmo com o app fechado. Falha silenciosamente em navegadores sem
// suporte (ex: Safari iOS fora de um app instalado na tela inicial).
export async function subscribeToPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const { publicKey } = await api.pushPublicKey();
    if (!publicKey) return;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await api.pushSubscribe(subscription.toJSON());
  } catch {
    // ambiente sem suporte a push (ex: iOS Safari fora do modo instalado)
  }
}
