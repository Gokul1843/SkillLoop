import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCheck,
  UserPlus,
  MessageCircle,
  Heart,
  MessageSquare,
  Check,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  query,
  where,
  updateDoc,
  doc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase/firebase";
import "./App.css";

const iconFor = (type) => {
  if (type === "friend_request" || type === "friend_accepted") return UserPlus;
  if (type === "message") return MessageCircle;
  if (type === "like") return Heart;
  if (type === "comment") return MessageSquare;
  return Bell;
};

export default function Notifications({ user, onNavigate, onUnreadCountChange }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.uid) return;
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("recipientId", "==", user.uid)
    );
    return onSnapshot(
      notificationsQuery,
      (snapshot) => {
        setItems(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => {
              const aTime = a.createdAt?.toMillis?.() || 0;
              const bTime = b.createdAt?.toMillis?.() || 0;
              return bTime - aTime;
            })
            .slice(0, 50)
        );
        setError("");
      },
      (err) => {
        console.error("Notifications listener error:", err);
        setError("Notifications load nahi hue. Firestore rules check karo.");
      }
    );
  }, [user?.uid]);

  const unreadCount = useMemo(
    () => items.filter((item) => !item.read).length,
    [items]
  );

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  async function openNotification(item) {
    try {
      if (!item.read) {
        await updateDoc(doc(db, "notifications", item.id), { read: true });
      }
    } catch (err) {
      console.error("Mark notification read failed:", err);
    }
    setOpen(false);
    if (item.type === "message") onNavigate?.("Messages");
    else if (item.type === "friend_request" || item.type === "friend_accepted") onNavigate?.("Friends");
    else onNavigate?.("Home");
  }

  async function markAllRead() {
    const unread = items.filter((item) => !item.read);
    if (!unread.length) return;
    try {
      const batch = writeBatch(db);
      unread.forEach((item) => {
        batch.update(doc(db, "notifications", item.id), { read: true });
      });
      await batch.commit();
    } catch (err) {
      console.error("Mark all notifications read failed:", err);
      setError("Notifications read mark nahi hue.");
    }
  }

  return (
    <div className="notification-widget">
      <button
        type="button"
        className="notification-bell"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={22} />
        {unreadCount > 0 && (
          <span className="notification-count">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section className="notification-panel notifications-page" aria-label="Notifications panel">
          <div className="notification-panel-header">
            <div className="notifications-heading">
              <strong>Notifications 🔔</strong>
              <small>
                {unreadCount > 0
                  ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
                  : "You're all caught up!"}
              </small>
            </div>
            <button
              type="button"
              className="notification-mark-all"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              title="Mark all as read"
            >
              <CheckCheck size={17} /> Read all
            </button>
          </div>

          {error && <p className="notification-error">{error}</p>}
          {items.length === 0 ? (
            <p className="notification-empty notifications-empty">
              <span className="notifications-empty-icon">✨</span>
              <strong>You're all caught up!</strong>
              <span>No notifications yet. New activity will appear here.</span>
            </p>
          ) : (
            <div className="notification-list">
              {items.map((item) => {
                const ItemIcon = iconFor(item.type);
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`notification-item ${item.read ? "" : "unread"}`}
                    onClick={() => openNotification(item)}
                  >
                    <span className="notification-item-icon"><ItemIcon size={18} /></span>
                    <span className="notification-item-body">
                      <strong>{item.actorName || "SkillLoop user"}</strong>
                      <span>{item.message || "You have a new notification."}</span>
                      <small>
                        {item.createdAt?.toDate
                          ? item.createdAt.toDate().toLocaleString()
                          : "Just now"}
                      </small>
                    </span>
                    {!item.read && <span className="notification-unread-dot" aria-label="Unread" />}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
