import { Router } from "express";
import { authMiddleware } from "../auth.js";
import { VAPID_PUBLIC_KEY, saveSubscription, removeSubscription } from "../push.js";

const router = Router();

router.get("/public-key", (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY || null });
});

router.use(authMiddleware);

router.post("/subscribe", async (req, res) => {
  const { subscription } = req.body || {};
  if (!subscription?.endpoint || !subscription?.keys) {
    return res.status(400).json({ error: "Inscrição inválida" });
  }
  await saveSubscription(req.user.id, subscription);
  res.json({ ok: true });
});

router.post("/unsubscribe", async (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) await removeSubscription(endpoint);
  res.json({ ok: true });
});

export default router;
