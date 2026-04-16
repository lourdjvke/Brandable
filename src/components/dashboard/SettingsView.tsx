import { useState, useEffect } from "react";
import { UserProfile } from "@/src/types";
import { db, auth } from "@/src/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { signOut, updateProfile } from "firebase/auth";
import { User, LogOut, Key, BrainCircuit, Save, Loader2, Shuffle } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/src/lib/utils";

export default function SettingsView({ profile }: { profile: UserProfile }) {
  const [name, setName] = useState(profile.name || "");
  const [photoURL, setPhotoURL] = useState(profile.photoURL || "");
  const [apiKey, setApiKey] = useState(localStorage.getItem("gemini_api_key") || "");
  const envKey = process.env.GEMINI_API_KEY;
  const currentKey = apiKey || envKey;
  const [randomModel, setRandomModel] = useState(localStorage.getItem("gemini_random_model") === "true");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: name, photoURL });
      }
      await updateDoc(doc(db, "users", profile.uid), { name, photoURL });
      
      if (apiKey) {
        localStorage.setItem("gemini_api_key", apiKey);
      } else {
        localStorage.removeItem("gemini_api_key");
      }

      localStorage.setItem("gemini_random_model", randomModel.toString());
      
      setMessage("Settings saved successfully.");
    } catch (err: any) {
      setMessage("Error saving settings: " + err.message);
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-full bg-[#f8f9fa] pb-40"
    >
      <header className="px-6 pt-12 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </header>

      <div className="px-6 flex flex-col gap-6 max-w-2xl mx-auto">
        {/* Profile Section */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100 flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-neutral-50 pb-3">
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <User className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-sm">Profile</h2>
          </div>
          
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-500">Display Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 rounded-xl text-sm outline-none focus:ring-1 focus:ring-black transition-all"
                placeholder="Your name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-500">Photo URL</label>
              <input
                type="text"
                value={photoURL}
                onChange={(e) => setPhotoURL(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 rounded-xl text-sm outline-none focus:ring-1 focus:ring-black transition-all"
                placeholder="https://example.com/photo.jpg"
              />
            </div>
          </div>
        </section>

        {/* AI Copilot Section */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-neutral-100 flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-neutral-50 pb-3">
            <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
              <BrainCircuit className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-sm">AI Copilot</h2>
          </div>
          
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-500 flex items-center gap-2">
                <Key className="w-3 h-3" /> Gemini API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 rounded-xl text-sm outline-none focus:ring-1 focus:ring-black transition-all font-mono"
                placeholder={envKey ? "Using system key (AI Studio managed)" : "AIzaSy..."}
              />
              <p className="text-[10px] text-neutral-400">
                Stored locally in your browser. Check your quota at{" "}
                <a href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank" className="text-blue-500 hover:underline">ai.google.dev</a>
              </p>
            </div>

            <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl">
              <div className="flex items-center gap-3">
                <Shuffle className="w-4 h-4 text-neutral-500" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Randomize Model</span>
                  <span className="text-[10px] text-neutral-400">Switch between Flash, Pro, and Thinking models</span>
                </div>
              </div>
              <button
                onClick={() => setRandomModel(!randomModel)}
                className={cn(
                  "w-10 h-6 rounded-full transition-colors relative",
                  randomModel ? "bg-black" : "bg-neutral-200"
                )}
              >
                <motion.div 
                  layout
                  className="w-4 h-4 bg-white rounded-full absolute top-1"
                  initial={false}
                  animate={{ left: randomModel ? "20px" : "4px" }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-col gap-3 mt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-black text-white rounded-xl text-sm font-medium hover:scale-[1.02] active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
          
          {message && (
            <p className={cn("text-xs text-center font-medium", message.includes("Error") ? "text-red-500" : "text-green-500")}>
              {message}
            </p>
          )}

          <button
            onClick={handleLogout}
            className="w-full py-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-2 mt-4"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </motion.div>
  );
}
