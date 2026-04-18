import { useState, useEffect } from "react";
import { Youtube, Tag, ArrowRight, Check, X, Loader2, Copy } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";
import { db } from "@/src/lib/firebase";
import { doc, getDoc, collection, getDocs, writeBatch } from "firebase/firestore";
import { UserProfile } from "@/src/types";

interface LinkYouTubeProps {
  profile: UserProfile;
  onBack?: () => void;
}

let successfulProxyIndex = 0;

const PROXIES = [
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&ts=${Date.now()}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://win98icon.xyz/proxy?url=${encodeURIComponent(url)}`
];

async function fetchWithRetry(targetUrl: string) {
  const order = [successfulProxyIndex];
  for(let i = 0; i < PROXIES.length; i++) if(i !== successfulProxyIndex) order.push(i);
  
  for (const idx of order) {
    const proxyUrl = PROXIES[idx](targetUrl);
    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) continue;

      let content;
      if (proxyUrl.includes('allorigins')) {
        const json = await response.json();
        content = json.contents;
      } else {
        content = await response.text();
      }

      if (content && content.length > 50) {
        successfulProxyIndex = idx;
        return content;
      }
    } catch (e) { console.warn(`P${idx + 1} fail`); }
  }
  throw new Error("Target unavailable. Check URL.");
}

function formatViews(num: string | number) {
  if (!num) return "0";
  let n = typeof num === 'string' ? parseInt(num, 10) : num;
  if (isNaN(n)) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

export default function LinkYouTube({ profile, onBack }: LinkYouTubeProps) {
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [step, setStep] = useState(1);
  const [channelUrl, setChannelUrl] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  
  const [channelData, setChannelData] = useState<any>(null);
  const [videos, setVideos] = useState<any[]>([]);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const tags = [
    { id: "personal", label: "Personal YouTube", description: "Your main channel" },
    { id: "competitor", label: "Competitor", description: "Channels in your niche" },
    { id: "inspiration", label: "Inspiration", description: "Channels you admire" }
  ];

  useEffect(() => {
    async function loadData() {
      if (!profile?.uid) return;
      try {
        const docRef = doc(db, "youtube_channels", profile.uid);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setChannelData(snap.data());
          const vRef = collection(db, "youtube_channels", profile.uid, "videos");
          const vSnap = await getDocs(vRef);
          const vids = vSnap.docs.map(d => d.data());
          vids.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
          setVideos(vids);
        }
      } catch (err) {
        console.error("Error loading YouTube data:", err);
      } finally {
        setLoadingInitial(false);
      }
    }
    loadData();
  }, [profile.uid]);

  const handleNext = () => {
    if (step === 1 && channelUrl.trim()) setStep(2);
    else if (step === 2 && selectedTag) fetchAndSave(channelUrl, selectedTag, true);
  };

  const fetchAndSave = async (url: string, tag: string, isInitialSetup: boolean) => {
    setIsFetching(true);
    try {
      const html = await fetchWithRetry(url);
      
      const channelId = html.match(/"externalId":"(UC[a-zA-Z0-9_-]+)"/)?.[1] || html.match(/channelId" content="(UC[a-zA-Z0-9_-]+)"/)?.[1];
      const avatar = html.match(/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/)?.[1];
      const banner = html.match(/"banner":\{"thumbnails":\[\{"url":"([^"]+)"/)?.[1] || html.match(/og:image" content="([^"]+)"/)?.[1];
      const subString = html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"\}/)?.[1] || html.match(/"subscriberCountText":\{"accessibility":\{"accessibilityData":\{"label":"([^"]+)"/)?.[1];
      const desc = html.match(/meta name="description" content="([^"]+)"/)?.[1] || html.match(/"description":\{"simpleText":"([^"]+)"\}/)?.[1];

      if (!channelId) throw new Error("Private/Restricted Channel or unable to parse ID.");

      const rssContent = await fetchWithRetry(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(rssContent, "text/xml");
      const entries = Array.from(xmlDoc.getElementsByTagName("entry")).slice(0, 15);
      
      const channelName = xmlDoc.querySelector("title")?.textContent || "CHANNEL FEED";

      const newChannelData = {
        channelId,
        url,
        tag,
        name: channelName,
        avatar: avatar ? avatar.replace(/=s\d+/, '=s400') : "",
        banner: banner || "",
        subCount: subString ? subString.toUpperCase() : "? SUBS",
        desc: desc || "",
        updatedAt: Date.now()
      };

      const newVideos = entries.map(entry => {
        const title = entry.getElementsByTagName("title")[0]?.textContent || "Untitled";
        const link = entry.getElementsByTagName("link")[0]?.getAttribute("href") || "";
        const videoId = entry.getElementsByTagName("yt:videoId")[0]?.textContent || link.split('v=')[1];
        const pubDate = entry.getElementsByTagName("published")[0]?.textContent;
        const mediaGroup = entry.getElementsByTagName("media:group")[0] || entry.getElementsByTagName("group")[0];
        const thumbnail = mediaGroup?.getElementsByTagName("media:thumbnail")[0]?.getAttribute("url") || "";
        const views = mediaGroup?.getElementsByTagName("media:statistics")[0]?.getAttribute("views") || "0";

        return {
          id: videoId || Math.random().toString(36).substr(2, 9),
          title,
          link,
          pubDate: pubDate || new Date().toISOString(),
          thumbnail,
          views: parseInt(views || "0", 10),
          updatedAt: Date.now()
        };
      });

      const batch = writeBatch(db);
      const docRef = doc(db, "youtube_channels", profile.uid);
      batch.set(docRef, newChannelData);

      newVideos.forEach(v => {
        const vRef = doc(collection(db, "youtube_channels", profile.uid, "videos"), v.id);
        batch.set(vRef, v);
      });

      await batch.commit();

      setChannelData(newChannelData);
      newVideos.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
      setVideos(newVideos);

      if (isInitialSetup) setStep(3);

    } catch (err: any) {
      console.error(err);
      alert("Error analyzing channel: " + err.message);
    } finally {
      setIsFetching(false);
    }
  };

  const handleCopy = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(link);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  if (loadingInitial) {
    return (
      <div className="h-full flex flex-col items-center justify-center space-y-4 bg-[#f8f9fa]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading Channel</p>
      </div>
    );
  }

  // Dashboard View for already linked channels
  if (channelData && step !== 3) {
    return (
      <div className="h-full overflow-y-auto bg-[#f8f9fa] custom-scrollbar relative">
        <div className="max-w-6xl w-full mx-auto p-4 md:p-8 pb-32">
          
          <div className="relative w-full rounded-3xl overflow-hidden bg-white mb-8 border border-slate-200">
            <div 
              className="w-full h-32 md:h-56 bg-cover bg-center border-b border-slate-100" 
              style={{ backgroundImage: `url(${channelData.banner})`, backgroundColor: '#e2e8f0' }}
            />
            <div className="absolute top-0 left-0 right-0 h-32 md:h-56 bg-gradient-to-b from-transparent to-white/90 mix-blend-overlay" />
            <div className="relative p-6 flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6 mt-[-50px] md:mt-[-80px] text-center md:text-left">
              <img 
                src={channelData.avatar} 
                className="w-24 h-24 md:w-40 md:h-40 rounded-full border-4 border-white bg-slate-100 object-cover shadow-sm"
              />
              <div className="pb-2 md:pb-4 flex-1">
                <div className="flex flex-col md:flex-row items-center md:items-baseline gap-2 md:gap-3">
                  <h2 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tight truncate">{channelData.name}</h2>
                  <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-blue-100">
                    {channelData.subCount}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-2 line-clamp-2 max-w-2xl font-medium">{channelData.desc}</p>
                <div className="flex gap-4 mt-3 justify-center md:justify-start">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Latest Volume</span>
                    <span className="text-slate-900 font-bold text-sm tracking-tight">{videos.length} Uploads</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {videos.map((video) => (
              <div 
                key={video.id}
                onClick={() => setActiveVideo(video.id)}
                className="bg-white rounded-[24px] border border-slate-200 hover:border-blue-500/30 transition-all overflow-hidden flex flex-col group cursor-pointer"
              >
                <div className="relative aspect-video bg-slate-100">
                  <img src={video.thumbnail} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-700" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/10">
                    <div className="bg-white/90 p-4 rounded-full backdrop-blur-sm transform scale-75 group-hover:scale-100 transition-transform">
                      <Youtube className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                  <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-2 py-1 rounded-lg border border-slate-100 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span className="text-[10px] font-bold text-slate-900 uppercase tracking-tighter">{formatViews(video.views)} views</span>
                  </div>
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors tracking-tight">{video.title}</h3>
                    <div className="flex items-center gap-2 mt-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{new Date(video.pubDate).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleCopy(video.link); }} 
                    className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 text-[10px] font-bold uppercase py-2.5 rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-1.5"
                  >
                    {copiedLink === video.link ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                    {copiedLink === video.link ? "Copied!" : "Copy URL"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Floating Get Latest Button */}
        <button 
          onClick={() => fetchAndSave(channelData.url, channelData.tag, false)}
          disabled={isFetching}
          className="fixed bottom-6 right-6 md:bottom-8 md:right-8 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-600 px-4 py-2 rounded-full text-[10px] font-medium tracking-wide flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50 z-50"
        >
          {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          {isFetching ? "updating..." : "get latest"}
        </button>

        {/* Video Player Modal */}
        <AnimatePresence>
          {activeVideo && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 md:p-10 bg-slate-900/60 backdrop-blur-sm" 
              onClick={() => setActiveVideo(null)}
            >
              <div 
                className="relative w-full max-w-5xl aspect-video bg-black rounded-3xl overflow-hidden border border-slate-700" 
                onClick={e => e.stopPropagation()}
              >
                <button onClick={() => setActiveVideo(null)} className="absolute top-4 right-4 z-10 bg-white/10 hover:bg-white/20 text-white p-2 rounded-full backdrop-blur-md transition-colors">
                  <X className="w-5 h-5" />
                </button>
                <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${activeVideo}?autoplay=1&rel=0&showinfo=0`} frameBorder="0" allowFullScreen></iframe>
              </div>
              <a 
                href={`https://www.youtube.com/watch?v=${activeVideo}`} 
                target="_blank" 
                rel="noreferrer" 
                className="mt-6 bg-white hover:bg-slate-50 text-slate-900 text-xs font-bold uppercase tracking-wide px-8 py-3 rounded-full flex items-center gap-2 transition-colors border border-slate-200"
              >
                Open in YouTube <ArrowRight className="w-4 h-4" />
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Onboarding View
  return (
    <div className="h-full bg-[#f8f9fa] flex flex-col p-6 lg:p-12 overflow-y-auto">
      <div className="max-w-xl mx-auto w-full flex flex-col h-full min-h-[500px]">
        <div className="flex-1">
          <AnimatePresence mode="wait">
            
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8 mt-10"
              >
                <div className="space-y-4">
                  <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center">
                    <Youtube className="w-8 h-8 text-blue-600" />
                  </div>
                  <h1 className="text-4xl font-black tracking-tight text-slate-900 leading-tight">
                    Link your <br />
                    <span className="text-blue-600">YouTube Channel</span>
                  </h1>
                  <p className="text-slate-500 font-medium text-lg leading-relaxed">
                    We'll fetch metadata and analytics to help our AI better understand your visual style.
                  </p>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Channel URL</label>
                  <input
                    type="text"
                    value={channelUrl}
                    onChange={(e) => setChannelUrl(e.target.value)}
                    placeholder="e.g. youtube.com/@mkbhd"
                    className="w-full bg-white border border-slate-200 rounded-2xl px-6 py-4 text-lg font-medium text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all placeholder:text-slate-300"
                  />
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8 mt-10"
              >
                <div className="space-y-4">
                  <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center">
                    <Tag className="w-8 h-8 text-blue-600" />
                  </div>
                  <h1 className="text-4xl font-black tracking-tight text-slate-900 leading-tight">
                    How should we <br />
                    <span className="text-blue-600">category it?</span>
                  </h1>
                  <p className="text-slate-500 font-medium">
                    This helps structure the insights we pull into your workspace.
                  </p>
                </div>

                <div className="grid gap-3">
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => setSelectedTag(tag.id)}
                      className={cn(
                        "w-full text-left p-6 rounded-2xl border transition-all group",
                        selectedTag === tag.id 
                          ? "border-blue-600 bg-blue-50/50" 
                          : "border-slate-200 bg-white hover:border-slate-300"
                      )}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className={cn("font-bold text-lg", selectedTag === tag.id ? "text-blue-900" : "text-slate-900")}>{tag.label}</span>
                        {selectedTag === tag.id && <Check className="w-5 h-5 text-blue-600" />}
                      </div>
                      <p className={cn("text-sm font-medium", selectedTag === tag.id ? "text-blue-600/80" : "text-slate-500")}>{tag.description}</p>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center h-full text-center space-y-8 mt-20"
              >
                <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 12, stiffness: 200 }}
                  >
                    <Check className="w-10 h-10 text-blue-600" />
                  </motion.div>
                </div>
                <div className="space-y-3">
                  <h2 className="text-3xl font-black text-slate-900">Successfully Linked</h2>
                  <p className="text-slate-500 font-medium max-w-sm mx-auto leading-relaxed">
                    We've pulled metadata and recent uploads from <strong>{channelData?.name || "your channel"}</strong>.
                  </p>
                </div>
                <button
                  onClick={() => setStep(4)} // Triggers dashboard render
                  className="px-8 py-3.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all border border-slate-900"
                >
                  View Dashboard
                </button>
              </motion.div>
            )}
            
          </AnimatePresence>
        </div>

        {step < 3 && (
          <div className="pt-8 flex gap-3 pb-8">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                disabled={isFetching}
                className="px-8 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={(step === 1 && !channelUrl.trim()) || (step === 2 && !selectedTag) || isFetching}
              className="flex-1 bg-slate-900 text-white rounded-2xl py-4 flex items-center justify-center gap-2 font-bold hover:bg-slate-800 transition-all disabled:opacity-30 border border-slate-900"
            >
              {isFetching ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>{step === 2 ? "Finalize Linking" : "Continue"}</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
