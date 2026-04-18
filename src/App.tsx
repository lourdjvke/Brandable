import { useState, useEffect } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";
import { UserProfile } from "@/src/types";
import AuthScreen from "@/src/components/auth/AuthScreen";
import Dashboard from "@/src/components/dashboard/Dashboard";
import PublicFileViewer from "@/src/components/dashboard/PublicFileViewer";
import Loader from "@/src/components/ui/Loader";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [publicUrlInfo, setPublicUrlInfo] = useState<{userId: string, fileId: string} | null>(null);

  useEffect(() => {
    // Check if public view route
    const match = window.location.pathname.match(/^\/v\/([^/]+)\/([^/]+)\/?$/);
    if (match) {
      setPublicUrlInfo({ userId: match[1], fileId: match[2] });
      setLoading(false);
      return;
    }

    // Attempt to bypass auth blocks aggressively for precise offline usage
    if (!navigator.onLine) {
      // If offline, try to fallback to any auth state
      setTimeout(() => setLoading(false), 500); 
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Fetch profile
        const unsubProfile = onSnapshot(doc(db, "users", firebaseUser.uid), (docSnap) => {
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          }
          setLoading(false);
        });
        return () => unsubProfile();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (publicUrlInfo) {
    return <PublicFileViewer userId={publicUrlInfo.userId} fileId={publicUrlInfo.fileId} />;
  }

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-white text-black">
      <AnimatePresence mode="wait">
        {!user ? (
          <motion.div
            key="auth"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full"
          >
            <AuthScreen />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-full"
          >
            <Dashboard profile={profile} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
