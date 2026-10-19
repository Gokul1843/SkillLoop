
import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase/firebase";
import Auth from "./Auth";
import Home from "./Home";

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setChecking(false);
    });

    return unsubscribe;
  }, []);

  if (checking) {
    return <div className="loading">Loading SkillLoop...</div>;
  }

  return user ? <Home user={user} /> : <Auth />;
}
