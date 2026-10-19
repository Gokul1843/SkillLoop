import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { Search, UserPlus, UserCheck, Check, X, MessageCircle, Users, Clock, UserRound } from "lucide-react";
import { db } from "./firebase/firebase";
import { createNotification } from "./notifications";
import "./App.css";

const requestId = (fromId, toId) => `${fromId}_${toId}`;


function Avatar({ profile }) {
  const photo = profile?.photoURL;
  const label =
    profile?.displayName ||
    profile?.name ||
    profile?.email ||
    "User";

  const initials = label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="friend-avatar">
      {photo ? (
        <img src={photo} alt={`${label} profile`} />
      ) : (
        <span aria-label={`${label} initials`}>
          {initials || "U"}
        </span>
      )}
    </div>
  );
}

export default function Friends({
  user,
  onOpenMessages,
  onIncomingCountChange,
}) {
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [search, setSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadUsers() {
      setLoadingUsers(true);
      try {
        const snapshot = await getDocs(collection(db, "users"));
        const list = snapshot.docs
          .filter((item) => item.id !== user.uid)
          .map((item) => ({ id: item.id, ...item.data() }));
        if (!cancelled) setUsers(list);
      } catch (err) {
        if (!cancelled) setError(`Could not load users: ${err.message}`);
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    }
    if (user?.uid) loadUsers();
    return () => { cancelled = true; };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    setLoadingRequests(true);
    let outgoing = [];
    let incoming = [];
    const publish = () => {
      const byId = new Map();
      [...outgoing, ...incoming].forEach((item) => byId.set(item.id, item));
      setRequests([...byId.values()]);
      setLoadingRequests(false);
    };
    const outgoingQuery = query(collection(db, "friendRequests"), where("senderId", "==", user.uid));
    const incomingQuery = query(collection(db, "friendRequests"), where("receiverId", "==", user.uid));
    const unsubOutgoing = onSnapshot(outgoingQuery, (snapshot) => {
      outgoing = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      publish();
    }, (err) => { setError(`Could not load friend requests: ${err.message}`); setLoadingRequests(false); });
    const unsubIncoming = onSnapshot(incomingQuery, (snapshot) => {
      incoming = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      publish();
    }, (err) => { setError(`Could not load friend requests: ${err.message}`); setLoadingRequests(false); });
    return () => { unsubOutgoing(); unsubIncoming(); };
  }, [user?.uid]);

  const statusByUser = useMemo(() => {
    const result = {};
    requests.forEach((request) => {
      const otherId = request.senderId === user.uid ? request.receiverId : request.senderId;
      if (otherId) result[otherId] = { ...request, otherId, incoming: request.receiverId === user.uid };
    });
    return result;
  }, [requests, user.uid]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return users;
    return users.filter((profile) =>
      `${profile.displayName || profile.name || ""} ${profile.email || ""}`.toLocaleLowerCase().includes(term)
    );
  }, [users, search]);

  const friends = useMemo(() => users.filter((profile) => statusByUser[profile.id]?.status === "accepted"), [users, statusByUser]);
  const incomingRequests = useMemo(() => requests.filter((item) => item.receiverId === user.uid && item.status === "pending"), [requests, user.uid]);

  useEffect(() => {
    onIncomingCountChange?.(incomingRequests.length);
  }, [incomingRequests.length, onIncomingCountChange]);


  async function sendRequest(target) {
    if (!user?.uid || !target?.id || busyId) return;
    setBusyId(target.id); setError(""); setNotice("");

    try {
      const forwardRef = doc(
        db,
        "friendRequests",
        requestId(user.uid, target.id)
      );

      const reverseRef = doc(
        db,
        "friendRequests",
        requestId(target.id, user.uid)
      );

      setNotice("Checking existing requests...");

      const forwardSnap = await getDoc(forwardRef);
      console.log("Forward request read successful");

      const reverseSnap = await getDoc(reverseRef);
      console.log("Reverse request read successful");

      if (
        forwardSnap.exists() &&
        forwardSnap.data().status === "pending"
      ) {
        setNotice("Friend request already sent.");
      } else if (
        (forwardSnap.exists() &&
          forwardSnap.data().status === "accepted") ||
        (reverseSnap.exists() &&
          reverseSnap.data().status === "accepted")
      ) {
        setNotice("You are already friends.");
      } else if (
        reverseSnap.exists() &&
        reverseSnap.data().status === "pending"
      ) {
        await updateDoc(reverseRef, {
          status: "accepted",
          updatedAt: serverTimestamp(),
        });
        try {
          await createNotification({
            recipientId: target.id,
            actorId: user.uid,
            actorName: user.displayName || user.email || "SkillLoop user",
            type: "friend_accepted",
            message: "accepted your friend request.",
          });
        } catch (notificationError) {
          console.error("Friend accepted notification failed:", notificationError);
        }

        setNotice("You are now friends!");
      } else {
        setNotice("Sending friend request...");

        await setDoc(forwardRef, {
          senderId: user.uid,
          receiverId: target.id,
          status: "pending",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        console.log("Friend request created successfully");
        try {
          await createNotification({
            recipientId: target.id,
            actorId: user.uid,
            actorName: user.displayName || user.email || "SkillLoop user",
            type: "friend_request",
            message: "sent you a friend request.",
          });
        } catch (notificationError) {
          console.error("Friend request notification failed:", notificationError);
        }
        setNotice("Friend request sent!");
      }
    } catch (err) {
      console.error("Friend request error:", err);
      setError(`Could not send request: ${err.message}`);
    } finally {
      setBusyId("");
    }

  }

  async function acceptRequest(request) {
    setBusyId(request.id); setError(""); setNotice("");
    try {
      await updateDoc(doc(db, "friendRequests", request.id), { status: "accepted", updatedAt: serverTimestamp() });
      try {
        await createNotification({
          recipientId: request.senderId,
          actorId: user.uid,
          actorName: user.displayName || user.email || "SkillLoop user",
          type: "friend_accepted",
          message: "accepted your friend request.",
        });
      } catch (notificationError) {
        console.error("Friend accepted notification failed:", notificationError);
      }
      setNotice("Friend request accepted!");
    } catch (err) { setError(`Could not accept request: ${err.message}`); }
    finally { setBusyId(""); }
  }

  async function declineRequest(request) {
    setBusyId(request.id); setError(""); setNotice("");
    try {
      await deleteDoc(doc(db, "friendRequests", request.id));
      setNotice("Friend request declined.");
    } catch (err) { setError(`Could not decline request: ${err.message}`); }
    finally { setBusyId(""); }
  }

  async function removeFriend(profile) {
    if (!window.confirm(`Remove ${profile.displayName || profile.name || "this friend"} from your friends?`)) return;
    const request = statusByUser[profile.id];
    if (!request) return;
    setBusyId(profile.id); setError(""); setNotice("");
    try {
      await deleteDoc(doc(db, "friendRequests", request.id));
      setNotice("Friend removed.");
    } catch (err) { setError(`Could not remove friend: ${err.message}`); }
    finally { setBusyId(""); }
  }

  function UserCard({ profile, variant = "search" }) {
    const status = statusByUser[profile.id];
    const name = profile.displayName || profile.name || "SkillLoop user";
    return (
      <article className="friend-card" key={profile.id}>
        <Avatar profile={profile} />
        <div className="friend-card-info">
          <strong>{name}</strong>
          <span>{profile.email || "SkillLoop member"}</span>
          {status?.status === "pending" && <small>{status.incoming ? "Sent you a request" : "Request sent"}</small>}
        </div>
        <div className="friend-card-actions">
          {variant === "friend" ? (
            <>
              <button className="friend-btn friend-btn-primary" onClick={onOpenMessages} aria-label={`Open messages with ${name}`}><MessageCircle size={16} /> <span>Message</span></button>
              <button className="friend-btn friend-btn-quiet" onClick={() => removeFriend(profile)} disabled={busyId === profile.id} aria-label={`Remove ${name}`}><X size={17} /></button>
            </>
          ) : status?.status === "accepted" ? (
            <span className="friend-status"><UserCheck size={16} /> Friends</span>
          ) : status?.status === "pending" ? (
            status.incoming ? <span className="friend-status"><Clock size={16} /> Pending</span> : <button className="friend-btn" disabled><Clock size={16} /> Requested</button>
          ) : (
            <button className="friend-btn friend-btn-primary" onClick={() => sendRequest(profile)} disabled={!!busyId}><UserPlus size={16} /> <span>{busyId === profile.id ? "Sending…" : "Add friend"}</span></button>
          )}
        </div>
      </article>
    );
  }

  return (
    <section className="friends-page">
      <div className="friends-intro">
        <div className="friends-heading-icon"><Users size={24} /></div>
        <div><h2>Friends & Search</h2><p>Find people, send friend requests, and grow your SkillLoop community.</p></div>
      </div>

      {notice && <p className="friends-notice" role="status">{notice}</p>}
      {error && <p className="friends-error" role="alert">{error}</p>}

      <section className="friends-section">
        <div className="friends-section-title"><h3>Friend requests</h3><span>{incomingRequests.length}</span></div>
        {loadingRequests ? <p className="friends-muted">Loading requests…</p> : incomingRequests.length === 0 ? <p className="friends-empty">No new friend requests. You’re all caught up!</p> : incomingRequests.map((request) => {
          const profile = users.find((item) => item.id === request.senderId) || { id: request.senderId, displayName: "SkillLoop user" };
          return <article className="friend-card" key={request.id}>
            <Avatar profile={profile} />
            <div className="friend-card-info"><strong>{profile.displayName || profile.name || "SkillLoop user"}</strong><span>{profile.email || "Wants to connect with you"}</span></div>
            <div className="friend-card-actions">
              <button className="friend-btn friend-btn-primary" onClick={() => acceptRequest(request)} disabled={!!busyId}><Check size={16} /><span>Accept</span></button>
              <button className="friend-btn friend-btn-quiet" onClick={() => declineRequest(request)} disabled={!!busyId} aria-label="Decline request"><X size={17} /></button>
            </div>
          </article>;
        })}
      </section>

      <section className="friends-section">
        <div className="friends-section-title"><h3>Your friends</h3><span>{friends.length}</span></div>
        {loadingUsers || loadingRequests ? <p className="friends-muted">Loading friends…</p> : friends.length === 0 ? <p className="friends-empty">No friends yet. Search below and send your first request.</p> : friends.map((profile) => <UserCard key={profile.id} profile={profile} variant="friend" />)}
      </section>

      <section className="friends-section">
        <div className="friends-section-title"><h3>Discover people</h3><span>{filteredUsers.length}</span></div>
        <label className="friends-search">
          <Search size={19} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or email…" aria-label="Search users by name or email" />
          {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X size={17} /></button>}
        </label>
        {loadingUsers ? <p className="friends-muted">Finding people…</p> : filteredUsers.length === 0 ? <p className="friends-empty">No users match “{search}”. Try another name.</p> : filteredUsers.map((profile) => <UserCard key={profile.id} profile={profile} />)}
      </section>
    </section>
  );
}
