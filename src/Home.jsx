
import { useEffect, useState } from "react";
import Profile from "./Profile";


import {
  Home as HomeIcon,
  Compass,
  Trophy,
  User,
  LogOut,
  Send,
  Heart,
    MessageCircle
} from "lucide-react";


import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import Chat from "./Chat";
import { signOut } from "firebase/auth";
import { auth, db } from "./firebase/firebase";
import "./App.css";


function PostLikes({ postId, userId }) {
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


function PostComments({ postId, user }) {
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
  const [active, setActive] = useState("Home");
  const [postText, setPostText] = useState("");
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [profiles, setProfiles] = useState({});



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

  return (
    <div className="app">
      <aside className="sidebar">
        <h2 className="logo">
          Skill<span>Loop</span>
        </h2>

        {[

          ["Home", HomeIcon],
          ["Explore", Compass],
          ["Challenges", Trophy],
          ["Messages", MessageCircle],
          ["Profile", User],
        ].map(([name, Icon]) => (
          <button
            key={name}
            className={active === name ? "nav active" : "nav"}
            onClick={() => setActive(name)}
          >
            <Icon size={20} />
            {name}
          </button>
        ))}

        <button className="nav logout" onClick={logout}>
          <LogOut size={20} />
          Logout
        </button>
        <p className="side-note">Learn. Create. Grow.</p>
      </aside>

      <main className="content">

{active !== "Messages" && (
  <header className="topbar">
    <div>
      <h1>
        {active === "Home" ? "Welcome to SkillLoop!" : active}
      </h1>
      <p>Hello, {user.email || "Creator"} 👋</p>
    </div>
  </header>
)}


        {active === "Home" && (
          <>
            <section className="hero">
              <h2>Your next skill starts today.</h2>
              <p>Learn something new. Share what you create.</p>
              <button onClick={() => setActive("Challenges")}>
                Explore challenges
              </button>
            </section>

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

              {message && (
                <p className="auth-message" role="status">
                  {message}
                </p>
              )}
            </form>

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

                  <PostLikes postId={post.id} userId={user.uid} />
                  <PostComments postId={post.id} user={user} />

                </div>
              </article>
            ))}
          </>
        )}

        {active === "Explore" && (
          <section className="challenge">
            <div>
              <h3>Explore new skills 🌟</h3>
              <p>Discover drawing, coding, writing and design.</p>
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


        {active === "Profile" && <Profile user={user} />}
        {active === "Messages" && <Chat />}
      </main>
    </div >
  );
}
