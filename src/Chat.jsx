
import { useEffect, useState, useRef } from "react";
import {
    collection,
    addDoc,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    where,
    limit,
    updateDoc,
    increment,
    deleteDoc
} from "firebase/firestore";
import { auth, db } from "./firebase/firebase";
import { createNotification } from "./notifications";
import { Send, MessageCircle, ArrowLeft, Pencil, Trash2, Check, X, MoreVertical, Image } from "lucide-react";

export default function Chat() {
    const user = auth.currentUser;


    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [chatPreviews, setChatPreviews] = useState({});
    const [messages, setMessages] = useState([]);
    const [messageText, setMessageText] = useState("");
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [sending, setSending] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const [error, setError] = useState("");
    const [viewImage, setViewImage] = useState(null);

    const fileInputRef = useRef(null);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "end"
        });
    }, [messages]);

    useEffect(() => {
        if (!user) return;

        const loadUsers = async () => {
            try {
                const snapshot = await getDocs(collection(db, "users"));

                setUsers(
                    snapshot.docs
                        .filter((item) => item.id !== user.uid)
                        .map((item) => ({
                            id: item.id,
                            ...item.data()
                        }))
                );
            } catch (err) {
                console.error(err);
                setError("Users load nahi hue. Firestore rules check karo.");
            } finally {
                setLoadingUsers(false);
            }
        };

        loadUsers();
    }, [user]);

    useEffect(() => {
        if (!user) return;

        const chatsQuery = query(
            collection(db, "chats"),
            where("participants", "array-contains", user.uid)
        );

        const messageUnsubscribers = new Map();

        const unsubscribeChats = onSnapshot(
            chatsQuery,
            (snapshot) => {
                const activeChatIds = new Set(
                    snapshot.docs.map((item) => item.id)
                );

                // Remove listeners for chats that no longer exist
                for (const [chatId, unsubscribe] of messageUnsubscribers) {
                    if (!activeChatIds.has(chatId)) {
                        unsubscribe();
                        messageUnsubscribers.delete(chatId);
                    }
                }

                snapshot.docs.forEach((chatDoc) => {
                    const chatData = chatDoc.data();
                    const otherUserId = chatData.participants?.find(
                        (id) => id !== user.uid
                    );

                    if (otherUserId) {
                        setChatPreviews((previous) => ({
                            ...previous,
                            [otherUserId]: {
                                ...previous[otherUserId],
                                chatId: chatDoc.id,
                                unreadCount: chatData.unreadCounts?.[user.uid] || 0
                            }
                        }));
                    }
                    const chatId = chatDoc.id;




                    if (!otherUserId) return;

                    if (messageUnsubscribers.has(chatId)) return;

                    const latestMessageQuery = query(
                        collection(db, "chats", chatId, "messages"),
                        orderBy("createdAt", "desc"),
                        limit(1)
                    );

                    const unsubscribeMessage = onSnapshot(
                        latestMessageQuery,
                        (messageSnapshot) => {
                            const latestDoc = messageSnapshot.docs[0];
                            const latestMessage = latestDoc
                                ? latestDoc.data()
                                : null;

                            setChatPreviews((previous) => ({
                                ...previous,
                                [otherUserId]: {
                                    ...previous[otherUserId],
                                    chatId,
                                    text: latestMessage?.text || "",
                                    senderId: latestMessage?.senderId || "",
                                    createdAt: latestMessage?.createdAt || null,
                                },
                            }));
                        },
                        (error) => {
                            console.error(
                                "Last message listener error:",
                                error
                            );
                        }
                    );

                    messageUnsubscribers.set(
                        chatId,
                        unsubscribeMessage
                    );
                });
            },
            (error) => {
                console.error("Chat list error:", error);
                setError("Chat list load nahi hui.");
            }
        );

        return () => {
            unsubscribeChats();
            messageUnsubscribers.forEach((unsubscribe) => unsubscribe());
            messageUnsubscribers.clear();
        };
    }, [user]);

    useEffect(() => {
        if (!viewImage) return;

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                setViewImage(null);
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [viewImage]);


    const createOrOpenChat = async (otherUser) => {
        if (!user || !otherUser) return;

        setError("");

        const participants = [user.uid, otherUser.id].sort();
        const chatId = participants.join("_");

        try {
            console.log("1. Checking chat:", chatId);
            const chatRef = doc(db, "chats", chatId);
            const chatSnap = await getDoc(chatRef);

            if (!chatSnap.exists()) {
                await setDoc(chatRef, {
                    participants,
                    createdAt: serverTimestamp(),
                    unreadCounts: {
                        [user.uid]: 0,
                        [otherUser.id]: 0
                    }
                });
            } else {
                const chatData = chatSnap.data();

                if (!chatData.unreadCounts) {
                    await updateDoc(chatRef, {
                        unreadCounts: {
                            [user.uid]: 0,
                            [otherUser.id]: 0
                        }
                    });
                }
            }
            await updateDoc(chatRef, {
                [`unreadCounts.${user.uid}`]: 0
            });
            setSelectedUser({
                ...otherUser,
                chatId
            });
        } catch (err) {
            console.error("Chat open error:", err.code, err.message);
            setError(`Chat error: ${err.code || ""} ${err.message}`);
        }
    };

    useEffect(() => {
        if (!selectedUser?.chatId) {
            setMessages([]);
            return;
        }

        const messagesRef = collection(
            db,
            "chats",
            selectedUser.chatId,
            "messages"
        );

        const messagesQuery = query(
            messagesRef,
            orderBy("createdAt", "asc")
        );

        const unsubscribe = onSnapshot(
            messagesQuery,
            (snapshot) => {
                setMessages(
                    snapshot.docs.map((item) => ({
                        id: item.id,
                        ...item.data()
                    }))
                );


                snapshot.docs.forEach((messageDoc) => {
                    const message = messageDoc.data();

                    // Sirf doosre user ke unseen messages ko seen mark karo
                    if (message.senderId !== user.uid && message.seen === false) {
                        updateDoc(messageDoc.ref, {
                            seen: true
                        }).catch((error) => {
                            console.error("Seen status update error:", error);
                        });
                    }
                });

            },
            (err) => {
                console.error(err);
                setError("Messages load nahi hue. Rules check karo.");
            }
        );

        return unsubscribe;
    }, [selectedUser?.chatId]);


    const [editingMessageId, setEditingMessageId] = useState(null);
    const [editText, setEditText] = useState("");

    const editMessage = (message) => {
        setEditingMessageId(message.id);
        setEditText(message.text);
        setError("");
    };

    const saveEditedMessage = async (messageId) => {
        const text = editText.trim();

        if (!text || text.length > 2000) {
            setError("Message 1–2000 characters ka hona chahiye.");
            return;
        }

        try {
            await updateDoc(
                doc(db, "chats", selectedUser.chatId, "messages", messageId),
                { text, edited: true }
            );

            setEditingMessageId(null);
            setEditText("");
            setError("");
        } catch (err) {
            console.error(err);
            setError("Message edit nahi hua. Firestore rules check karo.");
        }
    };

    const deleteMessage = async (messageId) => {
        if (!window.confirm("Kya aap ye message delete karna chahte ho?")) {
            return;
        }

        try {
            await deleteDoc(
                doc(db, "chats", selectedUser.chatId, "messages", messageId)
            );

            setError("");
        } catch (err) {
            console.error(err);
            setError("Message delete nahi hua. Firestore rules check karo.");
        }
    };


    const handleImageSelect = (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";

        if (!file || !user || !selectedUser || sending) return;

        if (!file.type.startsWith("image/")) {
            setError("Sirf image file select karo.");
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setError("Image 5 MB se chhoti honi chahiye.");
            return;
        }

        if (imagePreview?.url) {
            URL.revokeObjectURL(imagePreview.url);
        }

        setError("");
        setImagePreview({
            file,
            url: URL.createObjectURL(file),
        });
    };


    const sendImage = async () => {
        if (!imagePreview?.file || !user || !selectedUser || sending) {
            return;
        }

        setSending(true);
        setError("");

        try {
            const formData = new FormData();
            formData.append("file", imagePreview.file);
            formData.append("upload_preset", "skillloop_chat");

            const response = await fetch(
                "https://api.cloudinary.com/v1_1/xz3nvckl/image/upload",
                {
                    method: "POST",
                    body: formData,
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error?.message || "Cloudinary upload failed"
                );
            }

            if (!result.secure_url) {
                throw new Error("Image URL nahi mila.");
            }

            await addDoc(
                collection(db, "chats", selectedUser.chatId, "messages"),
                {
                    text: "📷 Image",
                    imageUrl: result.secure_url,
                    senderId: user.uid,
                    createdAt: serverTimestamp(),
                    seen: false,
                }
            );

            await updateDoc(doc(db, "chats", selectedUser.chatId), {
                [`unreadCounts.${selectedUser.id}`]: increment(1),
            });
            try {
                await createNotification({
                    recipientId: selectedUser.id,
                    actorId: user.uid,
                    actorName: user.displayName || user.email || "SkillLoop user",
                    type: "message",
                    message: "sent you an image.",
                    targetId: selectedUser.chatId,
                });
            } catch (notificationError) {
                console.error("Image message notification failed:", notificationError);
            }

            URL.revokeObjectURL(imagePreview.url);
            setImagePreview(null);
        } catch (err) {
            console.error("Image send error:", err);
            setError(`Image send nahi hui: ${err.message}`);
        } finally {
            setSending(false);
        }
    };


    const sendMessage = async (event) => {
        event.preventDefault();

        const text = messageText.trim();

        if (!text || !user || !selectedUser || sending) return;

        if (text.length > 2000) {
            setError("Message 2000 characters se chhota rakho.");
            return;
        }

        setSending(true);
        setError("");

        try {
            await addDoc(
                collection(
                    db,
                    "chats",
                    selectedUser.chatId,
                    "messages"
                ),

                {
                    text,
                    senderId: user.uid,
                    createdAt: serverTimestamp(),
                    seen: false
                }

            );

            await updateDoc(doc(db, "chats", selectedUser.chatId), {
                [`unreadCounts.${selectedUser.id}`]: increment(1)
            });
            try {
                await createNotification({
                    recipientId: selectedUser.id,
                    actorId: user.uid,
                    actorName: user.displayName || user.email || "SkillLoop user",
                    type: "message",
                    message: "sent you a message.",
                    targetId: selectedUser.chatId,
                });
            } catch (notificationError) {
                console.error("Message notification failed:", notificationError);
            }

            setMessageText("");

        } catch (err) {
            console.error("Send message error:", err.code, err.message);
            setError(`${err.code}: ${err.message}`);
        } finally {
            setSending(false);
        }

    };

    if (!user) {
        return <p>Please log in to use private chat.</p>;
    }

    return (
        <section className="chat-page">
            <aside className={`chat-sidebar ${selectedUser ? "chat-sidebar-hidden" : ""}`}>
                <h2><MessageCircle size={22} /> Messages</h2>

                {loadingUsers ? (
                    <p> loading...</p>
                ) : users.length === 0 ? (
                    <p>Abhi koi doosra registered user nahi mila.</p>
                ) : (
                    users.map((item) => (
                        <button
                            className="chat-user"
                            key={item.id}
                            onClick={() => createOrOpenChat(item)}
                        >
                            <span className="chat-avatar">
                                {item.photoURL ? (
                                    <img src={item.photoURL} alt="" />
                                ) : (
                                    (item.displayName?.[0] || item.email?.[0] || "U").toUpperCase()
                                )}
                            </span>
                            <span>
                                <strong>
                                    {item.displayName || item.email || "SkillLoop user"}
                                </strong>

                                <small>
                                    {chatPreviews[item.id]?.text
                                        ? `${chatPreviews[item.id].senderId === user.uid ? "You: " : ""}${chatPreviews[item.id].text}`
                                        : "Start conversation"}
                                </small>
                                {(chatPreviews[item.id]?.unreadCount || 0) > 0 && (
                                    <span className="chat-unread-badge">
                                        {chatPreviews[item.id].unreadCount}
                                    </span>
                                )}
                            </span>
                        </button>
                    ))
                )}
            </aside>

            <div className={`chat-window ${selectedUser ? "chat-window-visible" : ""}`}>
                {!selectedUser ? (
                    <div className="chat-empty">
                        <MessageCircle size={48} />
                        <h3>Your messages</h3>
                        <p>Private conversation </p>
                    </div>
                ) : (
                    <>

                        <header className="chat-header">
                            <button
                                type="button"
                                className="chat-back"
                                onClick={() => setSelectedUser(null)}
                                aria-label="Back to users"
                            >
                                <ArrowLeft size={20} />
                            </button>

                            <span className="chat-avatar">
                                {selectedUser.photoURL ? (
                                    <img src={selectedUser.photoURL} alt="" />
                                ) : (
                                    (selectedUser.displayName?.[0] || "U").toUpperCase()
                                )}
                            </span>

                            <div className="chat-header-info">
                                <strong>
                                    {selectedUser.displayName ||
                                        selectedUser.email ||
                                        "SkillLoop user"}
                                </strong>

                                <p className="chat-user-status">SkillLoop chat</p>
                            </div>
                        </header>



                        <div className="chat-messages">
                            {messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={`chat-bubble ${message.senderId === user.uid ? "chat-mine" : "chat-theirs"
                                        }`}
                                >
                                    {editingMessageId === message.id ? (
                                        <div className="chat-edit-form">
                                            <textarea
                                                value={editText}
                                                onChange={(event) => setEditText(event.target.value)}
                                                maxLength={2000}
                                                autoFocus
                                            />

                                            <button
                                                type="button"
                                                onClick={() => saveEditedMessage(message.id)}
                                            >
                                                Save
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingMessageId(null);
                                                    setEditText("");
                                                }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <>

                                            {message.imageUrl ? (
                                                <a
                                                    href={message.imageUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="chat-image-link"
                                                >
                                                    {message.imageUrl && (
                                                        <img
                                                            className="chat-message-image"
                                                            src={message.imageUrl}
                                                            alt="Shared image"
                                                            loading="lazy"
                                                            onClick={() => setViewImage(message.imageUrl)}
                                                        />
                                                    )}
                                                </a>
                                            ) : (
                                                <p>{message.text}</p>
                                            )}



                                            <small className="message-time">
                                                {message.createdAt?.toDate
                                                    ? message.createdAt.toDate().toLocaleTimeString([], {
                                                        hour: "2-digit",
                                                        minute: "2-digit"
                                                    })
                                                    : "Sending..."}

                                                {message.senderId === user.uid && (
                                                    <span className={`message-tick ${message.seen ? "seen" : ""}`}>
                                                        {message.seen ? "✓✓" : "✓"}
                                                    </span>
                                                )}
                                            </small>


                                            {message.senderId === user.uid && (

                                                <div className="chat-message-menu">
                                                    <button
                                                        type="button"
                                                        className="chat-menu-trigger"
                                                        title="More options"
                                                        aria-label="Message options"
                                                        onClick={(event) => {
                                                            const menu = event.currentTarget.nextElementSibling;
                                                            menu.hidden = !menu.hidden;
                                                        }}
                                                    >
                                                        <MoreVertical size={18} />
                                                    </button>

                                                    <div className="chat-menu-dropdown" hidden>
                                                        <button
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.currentTarget.parentElement.hidden = true;
                                                                editMessage(message);
                                                            }}
                                                        >
                                                            <Pencil size={15} /> Edit
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={(event) => {
                                                                event.currentTarget.parentElement.hidden = true;
                                                                deleteMessage(message.id);
                                                            }}
                                                        >
                                                            <Trash2 size={15} /> Delete
                                                        </button>
                                                    </div>
                                                </div>

                                            )}
                                        </>
                                    )}
                                </div>
                            ))}

                            <div ref={messagesEndRef} />
                        </div>



                        <form className="chat-composer" onSubmit={sendMessage}>
                            {imagePreview && (
                                <div className="chat-image-preview">
                                    <img src={imagePreview.url} alt="Image preview" />

                                    <button
                                        type="button"
                                        disabled={sending}
                                        onClick={() => {
                                            URL.revokeObjectURL(imagePreview.url);
                                            setImagePreview(null);
                                        }}
                                    >
                                        Cancel
                                    </button>

                                    <button
                                        type="button"
                                        disabled={sending}
                                        onClick={sendImage}
                                    >
                                        {sending ? "Sending..." : "Send Image"}
                                    </button>
                                </div>
                            )}

                            <input
                                value={messageText}
                                onChange={(event) => setMessageText(event.target.value)}
                                placeholder="Type a private message..."
                                maxLength={2000}
                                aria-label="Message"
                            />

                            <button
                                type="button"
                                className="chat-image-button"
                                title="Select image"
                                disabled={sending}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Image size={21} />
                            </button>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={handleImageSelect}
                            />

                            <button type="submit" disabled={sending || !messageText.trim()}>
                                <Send size={18} />
                            </button>
                            {viewImage && (
                                <div
                                    className="chat-image-viewer"
                                    onClick={() => setViewImage(null)}
                                    role="dialog"
                                    aria-modal="true"
                                    aria-label="Image viewer"
                                >
                                    <button
                                        type="button"
                                        className="chat-image-viewer-close"
                                        aria-label="Close image"
                                        onClick={() => setViewImage(null)}
                                    >
                                        ×
                                    </button>

                                    <img
                                        src={viewImage}
                                        alt="Full-size shared image"
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </div>
                            )}
                        </form>

                    </>
                )}
            </div>

            {error && <p className="chat-error">{error}</p>}
        </section>
    );
}
