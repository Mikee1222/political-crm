import webpush from "web-push";

let vapidReady = false;

function ensureVapid() {
  if (vapidReady) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails("mailto:office@karacrm.gr", pub, priv);
  vapidReady = true;
  return true;
}

export function isWebPushConfigured(): boolean {
  return ensureVapid();
}

export async function sendWebPushToSubscription(
  subscription: webpush.PushSubscription,
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ensureVapid()) {
    return { ok: false, error: "VAPID keys not configured" };
  }
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "push error" };
  }
}
