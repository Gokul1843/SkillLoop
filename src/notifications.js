import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase/firebase";

/**
 * Create an in-app notification. Callers should never block the primary action
 * if notification creation fails.
 */
export async function createNotification({
  recipientId,
  actorId,
  actorName = "Someone",
  type,
  message,
  targetId = "",
}) {
  if (!recipientId || !actorId || recipientId === actorId) return;

  await addDoc(collection(db, "notifications"), {
    recipientId,
    actorId,
    actorName,
    type,
    message,
    targetId,
    read: false,
    createdAt: serverTimestamp(),
  });
}
