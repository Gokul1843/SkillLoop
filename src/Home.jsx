
import { useEffect, useState } from "react";
import Profile from "./Profile";


import {
  Home as HomeIcon,
  Compass,
  Trophy,
  User,
  LogOut,
  Moon,
  Sun,
  Send,
  Heart,
  MessageCircle,
  Users,
  Bell,
  UserCircle,
  ChevronDown,
  Settings,
} from "lucide-react";


import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import Chat from "./Chat";
import Friends from "./Friends";
import Notifications from "./Notifications.jsx";
import { createNotification } from "./notifications";
import { signOut } from "firebase/auth";
import { auth, db } from "./firebase/firebase";
import "./App.css";


function PostLikes({ postId, userId, authorId, actorName }) {
  const [count, setCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const likesRef = collection(db, "posts", postId, "likes");
    const myLikeRef = doc(db, "posts", postId, "likes", userId);

    const unsubscribeCount = onSnapshot(
      likesRef,
      (snapshot) => setCount(snapshot.size),
      (err) => setError(err.message)
    );

    const unsubscribeMine = onSnapshot(
      myLikeRef,
      (snapshot) => setLiked(snapshot.exists()),
      (err) => setError(err.message)
    );

    return () => {
      unsubscribeCount();
      unsubscribeMine();
    };
  }, [postId, userId]);

  async function toggleLike() {
    if (busy) return;

    setBusy(true);
    setError("");

    const myLikeRef = doc(db, "posts", postId, "likes", userId);

    try {
      if (liked) {
        await deleteDoc(myLikeRef);
      } else {
        await setDoc(myLikeRef, {
          createdAt: serverTimestamp(),
        });
        if (authorId && authorId !== userId) {
          try {
            await createNotification({
              recipientId: authorId,
              actorId: userId,
              actorName,
              type: "like",
              message: "liked your post.",
              targetId: postId,
            });
          } catch (notificationError) {
            console.error("Like notification failed:", notificationError);
          }
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="likes-area">
      <button
        className={liked ? "like liked" : "like"}
        onClick={toggleLike}
        disabled={busy}
        aria-pressed={liked}
      >
        <Heart
          size={18}
          fill={liked ? "currentColor" : "none"}
        />
        {liked ? "Liked" : "Like"} · {count}
      </button>

      {error && <p className="auth-message">{error}</p>}
    </div>
  );
}


function PostComments({ postId, postAuthorId, user }) {
  const [commentProfiles, setCommentProfiles] = useState({});
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  // Effect 1: Load comment profiles
  useEffect(() => {
    if (comments.length === 0) {
      setCommentProfiles({});
      return;
    }

    let cancelled = false;

    async function loadCommentProfiles() {
      try {
        const userIds = [
          ...new Set(
            comments.map((comment) => comment.authorId).filter(Boolean)
          ),
        ];

        const results = await Promise.all(
          userIds.map(async (uid) => {
            const profileDoc = await getDoc(doc(db, "users", uid));

            return [
              uid,
              profileDoc.exists() ? profileDoc.data() : {},
            ];
          })
        );

        if (!cancelled) {
          setCommentProfiles(Object.fromEntries(results));
        }
      } catch (error) {
        console.error("Could not load comment profiles:", error);
      }
    }

    loadCommentProfiles();

    return () => {
      cancelled = true;
    };
  }, [comments]);

  // Effect 2: Listen for comments
  useEffect(() => {
    const commentsQuery = query(
      collection(db, "posts", postId, "comments"),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(
      commentsQuery,
      (snapshot) => {
        setComments(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
        setLoading(false);
      },
      (err) => {
        setError("Could not load comments: " + err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [postId]);

  async function submitComment(e) {
    e.preventDefault();

    const commentText = text.trim();
    if (!commentText || sending) return;

    setSending(true);
    setError("");

    try {
      await addDoc(
        collection(db, "posts", postId, "comments"),
        {
          text: commentText,
          authorId: user.uid,
          authorEmail: user.email || "",
          createdAt: serverTimestamp(),
        }
      );

      setText("");
      if (postAuthorId && postAuthorId !== user.uid) {
        try {
          await createNotification({
            recipientId: postAuthorId,
            actorId: user.uid,
            actorName: user.displayName || user.email || "SkillLoop user",
            type: "comment",
            message: "commented on your post.",
            targetId: postId,
          });
        } catch (notificationError) {
          console.error("Comment notification failed:", notificationError);
        }
      }
    } catch (err) {
      setError("Comment failed: " + err.message);
    } finally {
      setSending(false);
    }
  }


  async function deleteComment(comment) {
    if (comment.authorId !== user.uid) {
      setError("You can only delete your own comments.");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to delete this comment?"
    );

    if (!confirmed) return;

    setDeletingId(comment.id);
    setError("");

    try {
      await deleteDoc(
        doc(db, "posts", postId, "comments", comment.id)
      );
    } catch (err) {
      setError("Could not delete comment: " + err.message);
    } finally {
      setDeletingId(null);
    }
  }


  return (
    <section className="comments-section">
      <h4>💬 Comments ({comments.length})</h4>

      <form onSubmit={submitComment} className="comment-form">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment..."
          maxLength={500}
          required
        />

        <button
          type="submit"
          disabled={sending || !text.trim()}
        >
          {sending ? "Sending..." : "Comment"}
        </button>
      </form>

      {error && <p className="auth-message">{error}</p>}

      {loading && <p>Loading comments...</p>}

      {!loading && comments.length === 0 && (
        <p className="comment-empty">No comments yet. Be the first!</p>
      )}

      {comments.map((comment) => (
        <div className="comment-item" key={comment.id}>
          <div className="comment-avatar">
            {(comment.authorEmail?.[0] || "U").toUpperCase()}
          </div>

          <div className="comment-content">
            <strong>{comment.authorEmail || "SkillLoop user"}</strong>
            <p>{comment.text}</p>
            <span>
              {comment.createdAt?.toDate
                ? comment.createdAt.toDate().toLocaleString()
                : "Just now"}
            </span>

            {comment.authorId === user.uid && (
              <button
                type="button"
                className="delete-comment"
                onClick={() => deleteComment(comment)}
                disabled={deletingId === comment.id}
              >
                {deletingId === comment.id ? "Deleting..." : "Delete"}
              </button>
            )}

          </div>
        </div>
      ))}
    </section>
  );
}




export default function Home({ user }) {
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("skillloop-theme") === "dark"
  );

  useEffect(() => {
    localStorage.setItem("skillloop-theme", darkMode ? "dark" : "light");
  }, [darkMode]);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [active, setActive] = useState("Home");
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postText, setPostText] = useState("");
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [profiles, setProfiles] = useState({});

  const [activeStory, setActiveStory] = useState(null);
  useEffect(() => {
    if (!activeStory) return;

    const timer = setTimeout(() => {
      setActiveStory((current) => {
        if (!current) return null;

        const index = stories.findIndex(
          (story) => story.id === current.id
        );

        if (index === stories.length - 1) {
          return null;
        }

        return stories[index + 1];
      });
    }, 5000);

    return () => clearTimeout(timer);
  }, [activeStory]);

  const stories = [
    {
      id: "art",
      title: "Art 🎨",
      emoji: "🎨",
      description: "Creativity has no limits. Share your art and let your imagination shine!"
    },
    {
      id: "coding",
      title: "Coding 💻",
      emoji: "💻",
      description: "Write your first line of code today. Every expert started as a beginner!"
    },
    {
      id: "learning",
      title: "Learning 📚",
      emoji: "📚",
      description: "Learn something new every day. Small steps lead to big achievements!"
    },
    {
      id: "design",
      title: "Design 📸",
      emoji: "📸",
      description: "Turn your ideas into beautiful designs. Create something unique!"
    },
    {
      id: "ideas",
      title: "Ideas 🚀",
      emoji: "🚀",
      description: "Every great project starts with one idea. What will you create?"
    },
    {
      id: "skills",
      title: "Skills 🎯",
      emoji: "🎯",
      description: "Practice your skills, challenge yourself, and keep growing!"
    }
  ];

  function showNextStory() {
    setActiveStory((current) => {
      if (!current) return null;
      const index = stories.findIndex((story) => story.id === current.id);
      return stories[(index + 1) % stories.length];
    });
  }

  function showPreviousStory() {
    setActiveStory((current) => {
      if (!current) return null;
      const index = stories.findIndex((story) => story.id === current.id);
      return stories[(index - 1 + stories.length) % stories.length];
    });
  }



  useEffect(() => {
    const postsQuery = query(
      collection(db, "posts"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      postsQuery,
      (snapshot) => {
        setPosts(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
        setLoading(false);
      },
      (error) => {
        setMessage("Could not load posts: " + error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (posts.length === 0) {
      setProfiles({});
      return;
    }

    let cancelled = false;

    async function loadProfiles() {
      try {
        const userIds = [
          ...new Set(posts.map((post) => post.authorId).filter(Boolean)),
        ];

        const results = await Promise.all(
          userIds.map(async (uid) => {
            const profileDoc = await getDoc(doc(db, "users", uid));

            return [
              uid,
              profileDoc.exists() ? profileDoc.data() : {},
            ];
          })
        );

        if (!cancelled) {
          setProfiles(Object.fromEntries(results));
        }
      } catch (error) {
        console.error("Could not load profiles:", error);
      }
    }

    loadProfiles();

    return () => {
      cancelled = true;
    };
  }, [posts]);



  async function createPost(e) {
    e.preventDefault();

    const text = postText.trim();
    if (!text || saving) return;

    setSaving(true);
    setMessage("");

    try {
      await addDoc(collection(db, "posts"), {
        text,
        authorId: user.uid,
        authorEmail: user.email || "",
        createdAt: serverTimestamp(),
      });

      setPostText("");
      setMessage("Your post was published!");
    } catch (error) {
      setMessage("Post failed: " + error.message);
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    try {
      await signOut(auth);
    } catch (error) {
      setMessage("Logout failed: " + error.message);
    }
  }
  const [unreadCount, setUnreadCount] = useState(0);
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);


  useEffect(() => {
    if (!user?.uid) {
      setUnreadMessagesCount(0);
      return;
    }

    const chatsQuery = query(
      collection(db, "chats"),
      where("participants", "array-contains", user.uid)
    );

    const unsubscribe = onSnapshot(
      chatsQuery,
      (snapshot) => {
        const total = snapshot.docs.reduce((sum, chatDoc) => {
          const unread = Number(
            chatDoc.data().unreadCounts?.[user.uid] || 0
          );

          return sum + unread;
        }, 0);

        setUnreadMessagesCount(total);
      },
      (error) => {
        console.error("Unread messages listener error:", error);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);


  return (
    <div className={darkMode ? "app dark-mode" : "app"}>
      <Notifications
        user={user}
        onNavigate={setActive}
        onUnreadCountChange={setUnreadCount}
      />

      <aside className="sidebar">
        <h2 className="logo">
          Skill<span>Loop</span>
        </h2>

        {[

          ["Home", HomeIcon],
          ["Explore", Compass],
          ["Friends", Users],
          ["Challenges", Trophy],
          ["Messages", MessageCircle],
          ["Profile", User],
          ["Notifications", Bell],
        ].map(([name, Icon]) => (
          <button
            key={name}
            className={`nav ${active === name ? "active" : ""} ${name === "Friends" ? "friends-nav" : ""
              } ${["Challenges", "Profile", "Notifications", "Dark Mode", "Logout"].includes(name)
                ? "mobile-hide-nav"
                : ""
              }`}
            onClick={() => setActive(name)}
          >
            <Icon size={20} />
            <span>{name}</span>

            {name === "Notifications" && unreadCount > 0 && (
              <span className="notification-badge">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>

            )}

            {name === "Friends" && friendRequestCount > 0 && (
              <span className="notification-badge">
                {friendRequestCount > 99 ? "99+" : friendRequestCount}
              </span>
            )}

            {name === "Messages" && unreadMessagesCount > 0 && (
              <span className="notification-badge">
                {unreadMessagesCount > 99 ? "99+" : unreadMessagesCount}
              </span>
            )}



          </button>
        ))}


        <button
          type="button"
          className="nav theme-toggle"
          onClick={() => setDarkMode((current) => !current)}
          aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          aria-pressed={darkMode}
        >
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          <span>{darkMode ? "Light Mode" : "Dark Mode"}</span>
        </button>

        <button className="nav logout" onClick={logout}>
          <LogOut size={20} />
          Logout
        </button>

        <p className="side-note">Learn. Create. Grow.</p>
      </aside>

      <main className="content">

        {active === "Home" && (
          <button
            type="button"
            className="mobile-create-post-btn"
            onClick={() => setShowCreatePost(true)}
            aria-label="Create a post"
          >
            +
          </button>
        )}
        {active !== "Messages" && (
          <header className="topbar">
            <div>
              <h1>
                {active === "Home" ? "Welcome to SkillLoop!" : active}
              </h1>
              <p>
                Hello, {user.displayName || user.email?.split("@")[0] || "User"} 👋
              </p>
            </div>

            <div className="profile-dropdown">
              <button
                type="button"
                className="profile-dropdown-trigger"
                onClick={() => setProfileMenuOpen((open) => !open)}
                aria-expanded={profileMenuOpen}
                aria-label="Open profile menu"
              >
                <span className="profile-menu-avatar">
                  {(user.displayName || user.email || "U")
                    .trim()
                    .charAt(0)
                    .toUpperCase()}
                </span>
                <span className="profile-menu-name">
                  {user.displayName || user.email?.split("@")[0] || "User"}
                </span>
                <ChevronDown size={16} />
              </button>

              {profileMenuOpen && (
                <div className="profile-dropdown-menu">
                  <button
                    type="button"
                    onClick={() => {
                      setActive("Profile");
                      setProfileMenuOpen(false);
                    }}
                  >
                    <UserCircle size={18} />
                    My Profile
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDarkMode((current) => !current);
                      setProfileMenuOpen(false);
                    }}
                  >
                    {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                    {darkMode ? "Light Mode" : "Dark Mode"}
                  </button>

                  <button
                    type="button"
                    className="profile-menu-logout"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      logout();
                    }}
                  >
                    <LogOut size={18} />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </header>
        )}



        {active === "Home" && (
          <>



            <section className="stories-section">
              <h2 className="section-title">✨ Discover & Create</h2>

              <div className="stories-list">
                {stories.map((story) => (
                  <button
                    type="button"
                    className="story-item"
                    key={story.id}
                    onClick={() => setActiveStory(story)}
                    aria-label={`Open ${story.title} story`}
                  >
                    <span className="story-ring">
                      <span className="story-circle">{story.emoji}</span>
                    </span>
                    <span>{story.title.split(" ")[0]}</span>
                  </button>
                ))}
              </div>
            </section>

            {activeStory && (
              <div
                className="story-overlay"
                onClick={() => setActiveStory(null)}
              >
                <section
                  className="story-viewer"
                  role="dialog"
                  aria-modal="true"
                  aria-label={`${activeStory.title} story`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="story-progress">
                    <span />
                  </div>

                  <button
                    type="button"
                    className="story-close"
                    onClick={() => setActiveStory(null)}
                    aria-label="Close story"
                  >
                    ✕
                  </button>

                  <div className="story-viewer-content">
                    <div className="story-big-emoji">
                      {activeStory.emoji}
                    </div>

                    <h2>{activeStory.title}</h2>
                    <p>{activeStory.description}</p>

                    <div className="story-navigation">
                      <button type="button" onClick={showPreviousStory}>
                        ← Previous
                      </button>

                      <button type="button" onClick={showNextStory}>
                        Next →
                      </button>
                    </div>

                    <button
                      type="button"
                      className="story-done"
                      onClick={() => setActiveStory(null)}
                    >
                      Done
                    </button>
                  </div>
                </section>
              </div>
            )}


            {/* Desktop create post form */}
            <div className="desktop-create-post">
              <h2 className="section-title">Create a post</h2>

              <form className="post-form" onSubmit={createPost}>
                <textarea
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                  placeholder="What have you learned or created today?"
                  maxLength={1000}
                  required
                  rows={4}
                />

                <div className="post-form-footer">
                  <span>{postText.length}/1000</span>
                  <button
                    className="create"
                    type="submit"
                    disabled={saving || !postText.trim()}
                  >
                    <Send size={17} />
                    {saving ? "Publishing..." : "Publish"}
                  </button>
                </div>

                {message && <p className="auth-message">{message}</p>}
              </form>
            </div>

            {/* Mobile create post popup */}
            {showCreatePost && (
              <div
                className="create-post-overlay"
                onClick={() => setShowCreatePost(false)}
              >
                <section
                  className="create-post-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Create a post"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="create-post-close"
                    onClick={() => setShowCreatePost(false)}
                    aria-label="Close"
                  >
                    ×
                  </button>

                  <h2>Create a post</h2>

                  <form
                    className="post-form"
                    onSubmit={async (e) => {
                      e.preventDefault();

                      if (!postText.trim() || saving) return;

                      setSaving(true);
                      setMessage("");

                      try {
                        await addDoc(collection(db, "posts"), {
                          text: postText.trim(),
                          authorId: user.uid,
                          authorEmail: user.email || "",
                          createdAt: serverTimestamp(),
                        });

                        setPostText("");
                        setMessage("Your post was published!");
                        setShowCreatePost(false);
                      } catch (error) {
                        setMessage("Post failed: " + error.message);
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >

                    <textarea
                      value={postText}
                      onChange={(e) => setPostText(e.target.value)}
                      placeholder="What have you learned or created today?"
                      maxLength={1000}
                      required
                      rows={5}
                    />

                    <div className="post-form-footer">
                      <span>{postText.length}/1000</span>
                      <button
                        className="create"
                        type="submit"
                        disabled={saving || !postText.trim()}
                      >
                        <Send size={17} />
                        {saving ? "Publishing..." : "Publish"}
                      </button>
                    </div>

                    {message && <p className="auth-message">{message}</p>}
                  </form>
                </section>
              </div>
            )}
            <h2 className="section-title">Community feed</h2>

            {loading && <p>Loading posts...</p>}

            {!loading && posts.length === 0 && (
              <p>No posts yet. Be the first to share something!</p>
            )}

            {posts.map((post) => (
              <article className="post community-post" key={post.id}>

                <div className="avatar">
                  {profiles[post.authorId]?.photoURL ? (
                    <img
                      src={profiles[post.authorId].photoURL}
                      alt="Profile"
                    />
                  ) : (
                    (
                      profiles[post.authorId]?.displayName?.[0] ||
                      post.authorEmail?.[0] ||
                      "U"
                    ).toUpperCase()
                  )}
                </div>


                <div className="post-body">
                  <strong>
                    {profiles[post.authorId]?.displayName ||
                      post.authorEmail ||
                      "SkillLoop user"}
                  </strong>

                  <p className="muted">
                    {post.createdAt?.toDate
                      ? post.createdAt.toDate().toLocaleString()
                      : "Just published"}
                  </p>
                  <p className="post-text">{post.text}</p>

                  <PostLikes postId={post.id} userId={user.uid} authorId={post.authorId} actorName={user.displayName || user.email || "SkillLoop user"} />
                  <PostComments postId={post.id} postAuthorId={post.authorId} user={user} />

                </div>
              </article>
            ))}
          </>
        )}

        {active === "Explore" && (
          <section className="explore-page">
            <h2>Explore Skills 🌟</h2>
            <p>Discover posts from the SkillLoop community.</p>

            {loading && <p>Loading posts...</p>}

            {!loading && posts.length === 0 && (
              <p>No posts yet. Be the first to share something!</p>
            )}

            <div className="explore-post-list">
              {posts.map((post) => {
                const profile = profiles[post.authorId] || {};
                const creatorName =
                  profile.displayName ||
                  profile.name ||
                  post.authorEmail ||
                  "SkillLoop Creator";

                return (
                  <article className="post community-post" key={post.id}>
                    <div className="avatar">
                      {profile.photoURL ? (
                        <img src={profile.photoURL} alt={creatorName} />
                      ) : (
                        creatorName.charAt(0).toUpperCase()
                      )}
                    </div>

                    <div className="post-body">
                      <strong>{creatorName}</strong>
                      <p className="post-text">{post.text}</p>

                      <PostLikes
                        postId={post.id}
                        userId={user.uid}
                        authorId={post.authorId}
                        actorName={user.displayName || user.email || "SkillLoop user"}
                      />

                      <PostComments
                        postId={post.id}
                        postAuthorId={post.authorId}
                        user={user}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {active === "Challenges" && (
          <section className="challenge">
            <div>
              <h3>Today's challenge 🎯</h3>
              <p>Create something in 15 minutes and share it with the community.</p>
            </div>
          </section>
        )}


        {active === "Friends" && (
          <Friends
            user={user}
            onOpenMessages={() => setActive("Messages")}
            onIncomingCountChange={setFriendRequestCount}
          />
        )}

        {active === "Messages" && <Chat />}
        {active === "Notifications" && (
          <Notifications
            user={user}
            onNavigate={setActive}
            onUnreadCountChange={setUnreadCount}
          />
        )}

        {active === "Profile" && <Profile user={user} />}



      </main>
    </div >
  );
}
