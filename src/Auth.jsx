
import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth, db } from "./firebase/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function Auth() {
  const [mode, setMode] = useState("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState(auth.currentUser);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);


  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      let result;

      if (mode === "signup") {
        result = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

        await setDoc(doc(db, "users", result.user.uid), {
          email: result.user.email || email.trim(),
          displayName: email.trim().split("@")[0],
          photoURL: "",
          createdAt: serverTimestamp(),
        });
      } else {
        result = await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );

        // Existing account ka profile missing ho to create karo.
        const userRef = doc(db, "users", result.user.uid);

        await setDoc(
          userRef,
          {
            email: result.user.email || email.trim(),
            displayName: result.user.email?.split("@")[0] || "SkillLoop user",
          },
          { merge: true }
        );
      }

      setUser(result.user);
      setMessage("Success! Welcome to SkillLoop.");
    } catch (error) {
      console.error("Authentication/profile error:", error);
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }


  async function handleLogout() {
    await signOut(auth);
    setUser(null);
    setMessage("You have logged out.");
  }

  if (user) {
    return (
      <div className="auth-card">
        <h2>Welcome to SkillLoop! 🎉</h2>
        <p>{user.email}</p>
        <button onClick={handleLogout}>Logout</button>
        {message && <p>{message}</p>}
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h2>{mode === "signup" ? "Create Account" : "Welcome Back"}</h2>
      <p>Join SkillLoop and grow your skills.</p>

      <form onSubmit={handleSubmit}>
        <label>Email</label>
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label>Password</label>
        <input
          type="password"
          placeholder="At least 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />

        <button type="submit" disabled={loading}>
          {loading
            ? "Please wait..."
            : mode === "signup"
              ? "Sign Up"
              : "Login"}
        </button>
      </form>

      {message && <p className="auth-message">{message}</p>}

      <p>
        {mode === "signup"
          ? "Already have an account?"
          : "New to SkillLoop?"}
        {" "}
        <button
          className="switch-mode"
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setMessage("");
          }}
        >
          {mode === "signup" ? "Login" : "Sign Up"}
        </button>
      </p>
    </div>
  );
}
