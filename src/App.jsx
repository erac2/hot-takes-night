import { useState, useEffect, useCallback, useRef } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const HOST_PASSWORD = "hottest-takes-2024";
const SHEETS_URL = import.meta.env.VITE_SHEETS_URL || "";
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY || "";

const THEMES = [
  { name: "INFERNO",  bg: "#1a0000", bgGrad: "#330000", accent: "#ff2d2d", accent2: "#ff6b6b", glow: "#ff4444", text: "#fff5f0", emoji: "🔥", vibe: "SCORCHING" },
  { name: "SOLAR",    bg: "#1a0a00", bgGrad: "#3d1a00", accent: "#ff8800", accent2: "#ffaa33", glow: "#ffaa44", text: "#fff5e6", emoji: "☀️", vibe: "BLAZING" },
  { name: "GOLDRUSH", bg: "#1a1500", bgGrad: "#3d3000", accent: "#ffdd00", accent2: "#ffe944", glow: "#ffe833", text: "#fffce6", emoji: "⚡", vibe: "ELECTRIC" },
  { name: "TOXIC",    bg: "#001a05", bgGrad: "#003d15", accent: "#22dd55", accent2: "#55ff88", glow: "#44ee77", text: "#e6ffec", emoji: "☢️", vibe: "RADIOACTIVE" },
  { name: "OCEANIC",  bg: "#001a2e", bgGrad: "#003d5c", accent: "#00aaff", accent2: "#33ccff", glow: "#44ccff", text: "#e6f5ff", emoji: "🌊", vibe: "GLACIAL" },
  { name: "VOID",     bg: "#0a001a", bgGrad: "#1f003d", accent: "#9933ff", accent2: "#bb66ff", glow: "#aa66ff", text: "#f0e6ff", emoji: "👁️", vibe: "ETHEREAL" },
  { name: "FUCHSIA",  bg: "#1a0014", bgGrad: "#3d0033", accent: "#ff33aa", accent2: "#ff66cc", glow: "#ff66bb", text: "#ffe6f5", emoji: "💖", vibe: "UNHINGED" },
];

const getTheme = (i) => THEMES[i % THEMES.length];

const VIBE_EMOJIS = {
  INFERNO:  ["🔥", "💥", "🌋", "🚒", "👹", "🥵"],
  SOLAR:    ["☀️", "🍊", "🌅", "🦊", "🥕", "🔆"],
  GOLDRUSH: ["⚡", "💛", "🌟", "🍋", "👑", "💫"],
  TOXIC:    ["☢️", "🐸", "🌿", "🧪", "👽", "🍀"],
  OCEANIC:  ["🌊", "🐬", "❄️", "💎", "🧊", "🌀"],
  VOID:     ["👁️", "🔮", "🌌", "🦄", "✨", "🍆"],
  FUCHSIA:  ["💖", "🌸", "💅", "🦩", "🎀", "💋"],
};

// ─── Google Sheets Backend ────────────────────────────────────────────────────
async function syncToSheets(slide) {
  if (!SHEETS_URL) {
    console.warn("⚠️ SHEETS_URL is empty — check your .env file and restart dev server");
    return { ok: false, error: "No SHEETS_URL configured" };
  }
  try {
    console.log("📤 Syncing to Sheets:", SHEETS_URL.slice(0, 60) + "...");
    const res = await fetch(SHEETS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        action: "submit",
        id: slide.id,
        name: slide.name,
        opinion: slide.opinion,
        reasons: (slide.content.defensePoints || []).join(" | "),
        headline: slide.content.headline,
        closingBurn: slide.content.closingBurn,
        category: slide.content.category,
        emoji: slide.content.emoji,
        timestamp: new Date().toISOString(),
      }),
    });
    console.log("✅ Sheets request sent");
    return { ok: true };
  } catch (e) {
    console.error("❌ Sheets sync failed:", e);
    return { ok: false, error: e.message };
  }
}

async function markPresentedInSheet(id) {
  if (!SHEETS_URL) return;
  try {
    await fetch(SHEETS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "markPresented", id }),
    });
    console.log("✅ Marked presented in sheet:", id);
  } catch (e) {
    console.error("❌ Mark presented failed:", e);
  }
}

async function loadFromSheets() {
  if (!SHEETS_URL) {
    console.warn("⚠️ SHEETS_URL is empty — submissions will only save locally");
    return [];
  }
  try {
    console.log("📥 Loading from Sheets...");
    const r = await fetch(SHEETS_URL);
    if (!r.ok) {
      console.error("❌ Sheets fetch returned status", r.status);
      return [];
    }
    const data = await r.json();
    console.log("✅ Loaded", data?.count || 0, "submissions from Sheets");
    return Array.isArray(data?.slides) ? data.slides : [];
  } catch (e) {
    console.error("❌ Sheets load failed:", e);
    return [];
  }
}

// ─── AI: Anthropic API ────────────────────────────────────────────────────────
async function generateSlideContent(name, opinion, userReasons) {
  const hasReasons = userReasons.length > 0;
  const fallback = {
    headline: opinion,
    defensePoints: hasReasons ? userReasons : null,
    closingBurn: "I said what I said.",
    emoji: "🔥",
    category: "HOT TAKE",
    reactions: ["🤯", "💀", "😭"],
  };

  if (!ANTHROPIC_KEY) return fallback;

  try {
    const reasonsHint = hasReasons
      ? `\n\nThe presenter provided THEIR OWN reasons — USE THESE EXACTLY:\n${userReasons.map((r, i) => `${i+1}. ${r}`).join("\n")}`
      : `\n\nThe presenter did NOT provide reasons. Set "defensePoints" to null in your response.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `You're crafting supporting content for a presentation slide for "Unpopular Opinions Night" — a fun party game. Tone is unhinged, confident, terminally online, slightly absurd. Think tweet-that-goes-viral energy.

PRESENTER: ${name}
THE OPINION (already displayed on the slide as-is — do NOT echo it): "${opinion}"${reasonsHint}

Your job: generate a juicy mic-drop line, emoji, category, and reactions that SUPPORT this opinion. Do NOT restate the opinion.

MIC DROP (closingBurn) — make it JUICY (8-14 words):
- The last line of a text rant — confident, weird, oddly poetic, RIDES for the take.
- Use unexpected imagery, contradictions, or vibes-based logic.
- DO NOT explain or justify. DO NOT moralize. Just drop the line and walk away.
- DO NOT use "Period." or "End of story" or "Facts."
- Examples of the vibe:
  * "Sometimes you just gotta mind your business while kissing strangers."
  * "I'd rather be wrong and interesting than right and boring."
  * "The vibes were immaculate, the data was secondary."
  * "Cry about it in 4K."
  * "Built different, raised wrong, never apologized."
  * "If you know, you know. If you don't, stay mad."
- Match the topic of the actual opinion — be specific, not generic.

Respond with ONLY this JSON (no markdown, no backticks):
{"closingBurn":"juicy 8-14 word mic-drop","emoji":"single emoji that matches the opinion's topic","category":"2-3 word topic like FOOD TAKE or DATING TAKE","reactions":["3 reaction emojis matching the vibe"]}

${hasReasons ? "Use the presenter's reasons verbatim as the slide's defense points (handled by the app, not you)." : ""}`
        }]
      })
    });

    if (!response.ok) return fallback;
    const data = await response.json();
    const block = data?.content?.find(b => b.type === "text");
    if (!block?.text) return fallback;

    const cleaned = block.text.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return fallback;

    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (!parsed.headline) return fallback;

    const headline = opinion; // ALWAYS use the actual opinion, never AI version
    let closingBurn = parsed.closingBurn || fallback.closingBurn;
    if (closingBurn.split(" ").length > 16) closingBurn = closingBurn.split(" ").slice(0, 14).join(" ") + "...";

    return {
      headline,
      defensePoints: hasReasons ? userReasons : null,
      closingBurn,
      emoji: parsed.emoji || fallback.emoji,
      category: parsed.category || fallback.category,
      reactions: Array.isArray(parsed.reactions) && parsed.reactions.length >= 3 ? parsed.reactions.slice(0, 3) : fallback.reactions,
    };
  } catch (err) {
    console.warn("Generation error:", err);
    return fallback;
  }
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
function ConfettiBurst({ theme, count = 30 }) {
  const pieces = Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.3,
    duration: 2 + Math.random() * 2,
    color: [theme.accent, theme.accent2, theme.glow, "#fff"][i % 4],
    size: 6 + Math.random() * 8,
    rotation: Math.random() * 360,
  }));
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 4 }}>
      {pieces.map(p => (
        <div key={p.id} style={{
          position: "absolute", left: `${p.left}%`, top: "-20px",
          width: p.size, height: p.size * 1.5, background: p.color,
          animation: `confettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
          transform: `rotate(${p.rotation}deg)`,
        }} />
      ))}
    </div>
  );
}

// ─── Floating Emojis ──────────────────────────────────────────────────────────
function FloatingEmojis({ emojis, count = 12, opacity = 0.15 }) {
  const items = Array.from({ length: count }, (_, i) => ({
    id: i, emoji: emojis[i % emojis.length],
    left: (i * 13.7) % 100, top: (i * 31.3) % 100,
    size: 28 + (i % 4) * 18, duration: 8 + (i % 5) * 3, delay: (i * 0.3) % 3,
  }));
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {items.map(p => (
        <div key={p.id} style={{
          position: "absolute", left: `${p.left}%`, top: `${p.top}%`,
          fontSize: p.size, opacity,
          animation: `floatBob ${p.duration}s ${p.delay}s ease-in-out infinite`,
        }}>{p.emoji}</div>
      ))}
    </div>
  );
}

// ─── Theme Bg ─────────────────────────────────────────────────────────────────
function ThemeShapes({ theme, intensity = 1 }) {
  const { accent, accent2 } = theme;
  const emojis = VIBE_EMOJIS[theme.name] || ["✨"];
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${theme.bg} 0%, ${theme.bgGrad} 100%)` }} />
      <FloatingEmojis emojis={emojis} count={14} opacity={0.13 * intensity} />
      <div style={{
        position: "absolute", top: "-15%", right: "-10%", width: 500, height: 500, borderRadius: "50%",
        background: `radial-gradient(circle, ${accent}66 0%, transparent 65%)`, filter: "blur(40px)",
        animation: "floatSlow 18s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", bottom: "-15%", left: "-10%", width: 450, height: 450, borderRadius: "50%",
        background: `radial-gradient(circle, ${accent2}55 0%, transparent 65%)`, filter: "blur(40px)",
        animation: "floatSlow 22s ease-in-out infinite reverse",
      }} />
      <div style={{
        position: "absolute", inset: 0, opacity: 0.05 * intensity,
        backgroundImage: `repeating-linear-gradient(45deg, ${accent} 0, ${accent} 2px, transparent 2px, transparent 24px)`,
      }} />
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 6,
        background: `linear-gradient(90deg, ${accent}, ${accent2}, ${theme.glow}, ${accent2}, ${accent})`,
        backgroundSize: "200% 100%", animation: "rainbowShift 4s linear infinite",
        boxShadow: `0 0 30px ${accent}`,
      }} />
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 6,
        background: `linear-gradient(90deg, ${theme.glow}, ${accent2}, ${accent}, ${accent2}, ${theme.glow})`,
        backgroundSize: "200% 100%", animation: "rainbowShift 4s linear infinite reverse",
        boxShadow: `0 0 30px ${accent}`,
      }} />
    </>
  );
}

// ─── Comic Burst ──────────────────────────────────────────────────────────────
function ComicBurst({ color, size = 200, children, style = {} }) {
  const points = [];
  const spikes = 16;
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 50 : 35;
    points.push(`${50 + Math.cos(angle) * r},${50 + Math.sin(angle) * r}`);
  }
  return (
    <div style={{ position: "relative", width: size, height: size, ...style }}>
      <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", filter: `drop-shadow(0 0 20px ${color}88)` }}>
        <polygon points={points.join(" ")} fill={color} />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Bungee', sans-serif", color: "#000", fontSize: size * 0.16,
        textAlign: "center", padding: "20%", lineHeight: 0.95, textTransform: "uppercase",
      }}>{children}</div>
    </div>
  );
}

// ─── Spin Wheel ───────────────────────────────────────────────────────────────
function SpinWheel({ candidates, onPick, onCancel, autoSpin = false }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  const hasAutoSpun = useRef(false);

  const slices = candidates.length;
  const sliceAngle = 360 / slices;

  const spin = () => {
    if (spinning || slices === 0) return;
    setSpinning(true); setWinner(null);
    const targetIndex = Math.floor(Math.random() * slices);
    const sliceCenterFromTop = targetIndex * sliceAngle + sliceAngle / 2;
    const baseSpins = 5 + Math.floor(Math.random() * 3);
    const finalRotation = baseSpins * 360 + (360 - sliceCenterFromTop);
    setRotation(prev => prev + finalRotation);
    setTimeout(() => { setSpinning(false); setWinner(candidates[targetIndex]); }, 4200);
  };

  // Auto-spin on open if triggered from previous presentation
  useEffect(() => {
    if (autoSpin && !hasAutoSpun.current && slices > 0) {
      hasAutoSpun.current = true;
      setTimeout(() => spin(), 600); // small delay so user sees the wheel before it spins
    }
  }, [autoSpin, slices]);

  // Spacebar/Enter on winner screen → present
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === " " || e.key === "Enter") && winner) {
        e.preventDefault();
        onPick(winner);
      } else if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [winner, onPick, onCancel]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.95)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 20, overflow: "auto",
    }}>
      {THEMES.slice(0, 5).map((t, i) => (
        <div key={i} style={{
          position: "absolute", width: 300, height: 300, borderRadius: "50%",
          background: t.accent, opacity: 0.1, filter: "blur(60px)",
          top: `${(i * 19) % 80}%`, left: `${(i * 23) % 80}%`,
          animation: `floatSlow ${14 + i * 2}s ease-in-out infinite`, pointerEvents: "none",
        }} />
      ))}

      <button onClick={onCancel} style={{
        position: "absolute", top: 20, right: 20,
        background: "transparent", border: "2px solid #444", color: "#aaa",
        padding: "8px 14px", fontFamily: "'Bungee', sans-serif", fontSize: 11,
        letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", zIndex: 3,
      }}>✕ Close</button>

      <div style={{ textAlign: "center", marginBottom: 24, zIndex: 2, position: "relative" }}>
        <h2 style={{
          fontFamily: "'Bungee', sans-serif", fontSize: "clamp(28px, 5vw, 44px)", margin: 0,
          background: `linear-gradient(90deg, ${THEMES.map(t => t.accent).join(", ")})`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          backgroundSize: "200% 100%", animation: "rainbowShift 3s linear infinite",
          textTransform: "uppercase", letterSpacing: "-0.02em",
        }}>🎡 Spin the Wheel!</h2>
        <p style={{ color: "#888", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", marginTop: 8 }}>
          {slices} unrevealed take{slices !== 1 ? "s" : ""} · who's up next?
        </p>
      </div>

      <div style={{ position: "relative", width: "min(90vw, 460px)", height: "min(90vw, 460px)", zIndex: 2 }}>
        <div style={{
          position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)",
          width: 0, height: 0,
          borderLeft: "22px solid transparent", borderRight: "22px solid transparent",
          borderTop: "36px solid #fff",
          filter: "drop-shadow(0 0 12px rgba(255,255,255,0.8))", zIndex: 5,
        }} />
        <svg viewBox="0 0 200 200" style={{
          width: "100%", height: "100%",
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? "transform 4s cubic-bezier(0.17, 0.67, 0.16, 0.99)" : "none",
          filter: "drop-shadow(0 0 30px rgba(255,255,255,0.2))",
        }}>
          {candidates.map((slide, i) => {
            const theme = getTheme(i);
            const startAngle = i * sliceAngle - 90;
            const endAngle = startAngle + sliceAngle;
            const startRad = (startAngle * Math.PI) / 180;
            const endRad = (endAngle * Math.PI) / 180;
            const x1 = 100 + 95 * Math.cos(startRad);
            const y1 = 100 + 95 * Math.sin(startRad);
            const x2 = 100 + 95 * Math.cos(endRad);
            const y2 = 100 + 95 * Math.sin(endRad);
            const largeArc = sliceAngle > 180 ? 1 : 0;
            const midAngle = (startAngle + endAngle) / 2;
            const midRad = (midAngle * Math.PI) / 180;
            const textX = 100 + 60 * Math.cos(midRad);
            const textY = 100 + 60 * Math.sin(midRad);
            return (
              <g key={i}>
                <path
                  d={`M 100 100 L ${x1} ${y1} A 95 95 0 ${largeArc} 1 ${x2} ${y2} Z`}
                  fill={theme.accent} stroke="#000" strokeWidth="1"
                />
                <text
                  x={textX} y={textY} fill="#000"
                  fontSize={slices > 8 ? 7 : 10}
                  fontFamily="Bungee, sans-serif"
                  textAnchor="middle" dominantBaseline="middle"
                  transform={`rotate(${midAngle + 90} ${textX} ${textY})`}
                  style={{ textTransform: "uppercase", pointerEvents: "none" }}
                >
                  {slide.name.length > 10 ? slide.name.slice(0, 9) + "…" : slide.name}
                </text>
              </g>
            );
          })}
          <circle cx="100" cy="100" r="14" fill="#fff" stroke="#000" strokeWidth="2" />
          <circle cx="100" cy="100" r="6" fill="#000" />
        </svg>
      </div>

      <div style={{ marginTop: 30, display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", zIndex: 2 }}>
        {!winner && (
          <button onClick={spin} disabled={spinning} style={{
            background: spinning ? "#222" : `linear-gradient(90deg, ${THEMES.map(t => t.accent).join(", ")})`,
            backgroundSize: "200% 100%",
            animation: spinning ? "none" : "rainbowShift 3s linear infinite",
            color: spinning ? "#888" : "#000", border: "none", padding: "16px 36px",
            fontFamily: "'Bungee', sans-serif", fontSize: 16,
            letterSpacing: 3, textTransform: "uppercase", cursor: spinning ? "wait" : "pointer",
            boxShadow: spinning ? "none" : "0 0 30px rgba(255,255,255,0.3)",
          }}>
            {spinning ? "🌀 Spinning..." : "🎡 SPIN!"}
          </button>
        )}
        {winner && (
          <>
            <div style={{ width: "100%", textAlign: "center", marginBottom: 4 }}>
              <div style={{
                color: "#fff", fontFamily: "'Bungee', sans-serif",
                fontSize: "clamp(22px, 4vw, 32px)", textTransform: "uppercase",
                animation: "popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both",
                background: `linear-gradient(135deg, ${getTheme(candidates.indexOf(winner)).accent}, ${getTheme(candidates.indexOf(winner)).accent2})`,
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              }}>🎉 {winner.name}!</div>
              <div style={{ color: "#aaa", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 12, marginTop: 4, letterSpacing: 2, textTransform: "uppercase" }}>
                You're up next
              </div>
            </div>
            <button onClick={() => onPick(winner)} style={{
              background: getTheme(candidates.indexOf(winner)).accent,
              color: "#000", border: "none", padding: "16px 32px",
              fontFamily: "'Bungee', sans-serif", fontSize: 14,
              letterSpacing: 3, textTransform: "uppercase", cursor: "pointer",
              boxShadow: `4px 4px 0 ${getTheme(candidates.indexOf(winner)).glow}`,
            }}>▶ Present Now!</button>
            <button onClick={() => setWinner(null)} style={{
              background: "transparent", color: "#aaa", border: "2px solid #444",
              padding: "16px 24px", fontFamily: "'Bungee', sans-serif", fontSize: 12,
              letterSpacing: 2, textTransform: "uppercase", cursor: "pointer",
            }}>🔄 Re-spin</button>
          </>
        )}
      </div>

      {winner && <ConfettiBurst theme={getTheme(candidates.indexOf(winner))} count={40} />}
    </div>
  );
}

// ─── Presenter Mode ───────────────────────────────────────────────────────────
function PresenterMode({ slides, startIndex, onClose, onFinish }) {
  const [current, setCurrent] = useState(startIndex);
  const [showConfetti, setShowConfetti] = useState(false);

  const slideIndex = Math.floor(current / 2);
  const isTitleCard = current % 2 === 0;
  const isEnd = current >= slides.length * 2;
  const slide = slides[slideIndex];
  const theme = slide ? getTheme(slideIndex) : THEMES[0];

  useEffect(() => {
    if (isTitleCard && !isEnd) {
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 2500);
      return () => clearTimeout(t);
    }
  }, [current, isTitleCard, isEnd]);

  const next = useCallback(() => setCurrent(c => Math.min(c + 1, slides.length * 2)), [slides.length]);
  const prev = useCallback(() => setCurrent(c => Math.max(c - 1, 0)), []);
  const handleClose = () => { onFinish?.(); onClose(); };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        // If we're already on the end slide, pressing space/enter/→ triggers next-up flow
        if (isEnd) handleClose();
        else next();
      }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "Escape") handleClose();
      else if (e.key === "f" || e.key === "F") {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
        else document.exitFullscreen?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, isEnd]);

  const [touchStart, setTouchStart] = useState(null);
  const onTouchStart = (e) => setTouchStart(e.touches[0].clientX);
  const onTouchEnd = (e) => {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (diff > 50) next();
    else if (diff < -50) prev();
    setTouchStart(null);
  };

  if (isEnd) {
    return (
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{
        position: "fixed", inset: 0, zIndex: 9999, background: "#000",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        animation: "fadeIn 0.8s ease", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          {THEMES.map((t, i) => (
            <div key={i} style={{
              position: "absolute", width: 350, height: 350, borderRadius: "50%",
              background: t.accent, opacity: 0.15, filter: "blur(60px)",
              top: `${(i * 13) % 100}%`, left: `${(i * 17) % 100}%`,
              animation: `floatSlow ${15 + i * 2}s ease-in-out infinite`,
            }} />
          ))}
        </div>
        <FloatingEmojis emojis={["🎤", "🔥", "👏", "🎉", "🎊", "💯"]} count={18} opacity={0.3} />
        <ConfettiBurst theme={THEMES[Math.floor(Math.random() * THEMES.length)]} count={50} />
        <CloseBtn onClose={handleClose} theme={THEMES[0]} />
        <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: 30 }}>
          <div style={{ fontSize: "clamp(70px, 14vw, 140px)", animation: "shake 0.5s ease infinite", marginBottom: 10 }}>🎤</div>
          <h1 style={{
            fontFamily: "'Bungee', sans-serif", color: "#fff",
            fontSize: "clamp(40px, 9vw, 96px)", margin: "10px 0 20px", lineHeight: 0.9, letterSpacing: "-0.04em",
            background: `linear-gradient(90deg, ${THEMES.map(t => t.accent).join(", ")})`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundSize: "200% 100%", animation: "rainbowShift 3s linear infinite",
            textTransform: "uppercase",
          }}>Mic Dropped 🎤</h1>
          <p style={{ color: "#fff", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 14, letterSpacing: 6, textTransform: "uppercase" }}>
            Who's up next?
          </p>
          <button onClick={handleClose} style={{
            marginTop: 30,
            background: `linear-gradient(90deg, ${THEMES.map(t => t.accent).join(", ")})`,
            backgroundSize: "200% 100%", animation: "rainbowShift 3s linear infinite",
            color: "#000", border: "none", padding: "18px 36px",
            fontFamily: "'Bungee', sans-serif", fontSize: 16, letterSpacing: 3,
            textTransform: "uppercase", cursor: "pointer",
            boxShadow: "0 0 30px rgba(255,255,255,0.4)",
          }}>🎡 Spin for Next!</button>
          <p style={{ color: "#888", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 3, marginTop: 16, textTransform: "uppercase" }}>
            or press <span style={{ color: "#fff", padding: "2px 8px", border: "1px solid #444", background: "#111" }}>SPACE</span> / <span style={{ color: "#fff", padding: "2px 8px", border: "1px solid #444", background: "#111" }}>→</span>
          </p>
        </div>
      </div>
    );
  }

  if (isTitleCard) {
    return (
      <div onClick={next} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{
        position: "fixed", inset: 0, zIndex: 9999, background: theme.bg,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        animation: "slideEnter 0.7s cubic-bezier(0.16,1,0.3,1)", overflow: "hidden", cursor: "pointer",
      }}>
        <ThemeShapes theme={theme} intensity={1.2} />
        {showConfetti && <ConfettiBurst theme={theme} count={40} />}
        <CloseBtn onClose={handleClose} theme={theme} />
        <NavHints theme={theme} />

        <div style={{ position: "absolute", top: "10%", left: "5%", animation: "spinSlow 30s linear infinite, popIn 0.6s 0.4s cubic-bezier(0.34,1.56,0.64,1) both", opacity: 0, zIndex: 2 }}>
          <ComicBurst color={theme.accent2} size={140}>{theme.vibe}</ComicBurst>
        </div>
        <div style={{ position: "absolute", bottom: "12%", right: "6%", animation: "spinSlow 25s linear infinite reverse, popIn 0.6s 0.6s cubic-bezier(0.34,1.56,0.64,1) both", opacity: 0, zIndex: 2 }}>
          <ComicBurst color={theme.glow} size={120}>HOT!</ComicBurst>
        </div>

        <div style={{ position: "relative", zIndex: 3, textAlign: "center", padding: 30, maxWidth: 1100 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 14,
            padding: "12px 28px", background: theme.accent, color: theme.bg,
            fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(11px, 1.4vw, 14px)", fontWeight: 900,
            letterSpacing: 8, textTransform: "uppercase", marginBottom: 24,
            animation: "slideUp 0.6s 0.15s cubic-bezier(0.16,1,0.3,1) both",
            boxShadow: `0 6px 30px ${theme.accent}88`, transform: "skewX(-6deg)",
          }}>
            <span style={{ animation: "blink 1s infinite" }}>●</span>
            <span>Now Presenting</span>
            <span style={{ animation: "blink 1s 0.5s infinite" }}>●</span>
          </div>

          <div style={{
            fontFamily: "'Bungee', sans-serif",
            fontSize: "clamp(120px, 26vw, 320px)", lineHeight: 0.8, marginBottom: -20,
            animation: "popInBig 0.8s 0.3s cubic-bezier(0.34,1.56,0.64,1) both",
            background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accent2} 50%, ${theme.glow} 100%)`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            filter: `drop-shadow(0 0 60px ${theme.accent}88)`, letterSpacing: "-0.06em",
          }}>№{String(slideIndex + 1).padStart(2, "0")}</div>

          <h1 style={{
            fontFamily: "'Bungee', sans-serif", color: theme.text,
            fontSize: `clamp(40px, ${Math.max(6, 12 - slide.name.length * 0.3)}vw, ${Math.max(80, 180 - slide.name.length * 6)}px)`,
            margin: "10px 0 20px", lineHeight: 0.9, letterSpacing: "-0.03em",
            animation: "slideUp 0.7s 0.5s cubic-bezier(0.16,1,0.3,1) both",
            textShadow: `4px 4px 0 ${theme.accent}, 8px 8px 0 ${theme.accent2}88`,
            textTransform: "uppercase", wordBreak: "break-word", padding: "0 10px",
          }}>{slide.name}</h1>

          <div style={{
            display: "flex", justifyContent: "center", alignItems: "center", gap: 20, margin: "26px auto",
            animation: "fadeIn 0.8s 0.7s ease both",
          }}>
            <span style={{ fontSize: 32, animation: "wiggle 1s ease infinite" }}>{theme.emoji}</span>
            <div style={{ width: 80, height: 4, background: theme.accent, boxShadow: `0 0 12px ${theme.accent}` }} />
            <span style={{ fontSize: 32, animation: "wiggle 1s 0.3s ease infinite" }}>{slide.content.emoji}</span>
            <div style={{ width: 80, height: 4, background: theme.accent, boxShadow: `0 0 12px ${theme.accent}` }} />
            <span style={{ fontSize: 32, animation: "wiggle 1s 0.6s ease infinite" }}>{theme.emoji}</span>
          </div>

          <p style={{
            color: theme.glow, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
            fontSize: "clamp(20px, 2.6vw, 30px)", margin: 0,
            animation: "slideUp 0.7s 0.9s cubic-bezier(0.16,1,0.3,1) both", padding: "0 20px",
          }}>
            ...is about to drop a <span style={{ color: theme.accent, fontWeight: 900 }}>BOMB.</span> 💣
          </p>
        </div>
      </div>
    );
  }

  const c = slide.content;
  const hasReasons = c.defensePoints && c.defensePoints.length > 0;

  return (
    <div onClick={next} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{
      position: "fixed", inset: 0, zIndex: 9999, background: theme.bg,
      display: "flex", flexDirection: "column",
      animation: "slideEnter 0.7s cubic-bezier(0.16,1,0.3,1)", overflow: "hidden", cursor: "pointer",
    }}>
      <ThemeShapes theme={theme} intensity={0.85} />
      <CloseBtn onClose={handleClose} theme={theme} />
      <NavHints theme={theme} />

      {c.reactions.map((emoji, i) => (
        <div key={i} style={{
          position: "absolute", top: `${15 + i * 28}%`, right: `${3 + (i % 2) * 4}%`,
          fontSize: "clamp(50px, 7vw, 90px)",
          animation: `popIn 0.5s ${1.5 + i * 0.3}s cubic-bezier(0.34,1.56,0.64,1) both, wiggle 2.5s ${2 + i}s ease-in-out infinite`,
          opacity: 0, zIndex: 3,
          filter: `drop-shadow(0 4px 12px ${theme.bg})`,
          transform: `rotate(${(i - 1) * 15}deg)`,
        }}>{emoji}</div>
      ))}

      <div style={{
        position: "absolute", top: "8%", right: "20%",
        animation: "popIn 0.6s 0.5s cubic-bezier(0.34,1.56,0.64,1) both, spinSlow 30s linear infinite",
        opacity: 0, zIndex: 2,
      }}>
        <ComicBurst color={theme.accent2} size={110}>OOF!</ComicBurst>
      </div>

      <div style={{
        position: "absolute", top: 28, left: 28, zIndex: 4,
        display: "flex", alignItems: "center", gap: 14,
        animation: "slideRight 0.6s 0.1s cubic-bezier(0.16,1,0.3,1) both", maxWidth: "65%",
      }}>
        <div style={{
          width: "clamp(48px, 6vw, 64px)", height: "clamp(48px, 6vw, 64px)",
          background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accent2} 100%)`,
          color: theme.bg, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'Bungee', sans-serif", fontSize: "clamp(22px, 3vw, 30px)",
          boxShadow: `4px 4px 0 ${theme.glow}, 0 0 30px ${theme.glow}88`,
          transform: "rotate(-4deg)", flexShrink: 0,
        }}>{slide.name.charAt(0).toUpperCase()}</div>
        <div style={{ overflow: "hidden" }}>
          <div style={{
            color: theme.text, fontFamily: "'Bungee', sans-serif",
            fontSize: "clamp(16px, 2vw, 24px)", lineHeight: 1,
            textTransform: "uppercase",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{slide.name}</div>
          <div style={{
            color: theme.accent, fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, letterSpacing: 3, textTransform: "uppercase", marginTop: 5, fontWeight: 700,
          }}>{c.category}</div>
        </div>
      </div>

      <div style={{
        position: "absolute", left: 0, top: "15%", bottom: "15%", width: 10,
        background: `linear-gradient(180deg, ${theme.accent} 0%, ${theme.accent2} 50%, ${theme.glow} 100%)`,
        boxShadow: `0 0 30px ${theme.accent}`,
        animation: "slideUp 0.8s 0.2s cubic-bezier(0.16,1,0.3,1) both",
      }} />

      <div style={{
        flex: 1, display: "flex", flexDirection: "column", justifyContent: "center",
        padding: hasReasons ? "100px 5vw 80px" : "110px 5vw 90px",
        position: "relative", zIndex: 2, maxWidth: 1500, width: "100%", margin: "0 auto",
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 12, alignSelf: "flex-start",
          padding: "10px 22px", background: theme.accent, color: theme.bg,
          fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(11px, 1.3vw, 14px)",
          letterSpacing: 4, textTransform: "uppercase", marginBottom: 24, fontWeight: 900,
          animation: "slideUp 0.6s 0.2s cubic-bezier(0.16,1,0.3,1) both",
          boxShadow: `4px 4px 0 ${theme.glow}, 0 4px 24px ${theme.accent}88`,
          transform: "skewX(-6deg)",
        }}>
          <span style={{ fontSize: 22 }}>{c.emoji}</span>
          <span>The Hot Take</span>
          <span style={{ fontSize: 22 }}>{c.emoji}</span>
        </div>

        <div style={{
          background: `linear-gradient(135deg, ${theme.accent}22 0%, ${theme.bg}00 100%)`,
          borderLeft: `8px solid ${theme.accent}`, padding: "20px 28px",
          marginBottom: hasReasons ? 32 : 40, maxWidth: "92%",
          animation: "slideUp 0.7s 0.35s cubic-bezier(0.16,1,0.3,1) both",
        }}>
          <h1 style={{
            fontFamily: "'Bungee', sans-serif", color: theme.text,
            fontSize: (() => {
              const len = c.headline.length;
              // Scale: very short → big, very long → small
              // Tiers based on character count
              let maxPx, vw;
              if (len <= 25)       { maxPx = hasReasons ? 64 : 80; vw = hasReasons ? 5.2 : 6.4; }
              else if (len <= 45)  { maxPx = hasReasons ? 52 : 64; vw = hasReasons ? 4.2 : 5.2; }
              else if (len <= 70)  { maxPx = hasReasons ? 40 : 50; vw = hasReasons ? 3.3 : 4.0; }
              else if (len <= 100) { maxPx = hasReasons ? 32 : 40; vw = hasReasons ? 2.6 : 3.2; }
              else if (len <= 140) { maxPx = hasReasons ? 26 : 32; vw = hasReasons ? 2.1 : 2.6; }
              else                 { maxPx = hasReasons ? 22 : 28; vw = hasReasons ? 1.8 : 2.2; }
              return `clamp(18px, ${vw}vw, ${maxPx}px)`;
            })(),
            lineHeight: 1.1, letterSpacing: "-0.02em", margin: 0,
            textShadow: `3px 3px 0 ${theme.accent}, 6px 6px 0 ${theme.accent2}66`,
            textTransform: "uppercase", wordBreak: "break-word",
          }}>"{c.headline}"</h1>
        </div>

        {hasReasons && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 880, marginBottom: 28 }}>
            {c.defensePoints.map((pt, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "stretch",
                background: `${theme.accent}15`, border: `2px solid ${theme.accent}66`,
                borderLeft: `8px solid ${theme.accent}`,
                animation: `slideRight 0.5s ${0.65 + i * 0.15}s cubic-bezier(0.16,1,0.3,1) both`,
                boxShadow: `4px 4px 0 ${theme.bg}, 0 0 20px ${theme.accent}33`,
                transform: `rotate(${i % 2 === 0 ? "-0.3deg" : "0.3deg"})`,
              }}>
                <div style={{
                  background: theme.accent, color: theme.bg,
                  fontFamily: "'Bungee', sans-serif", fontSize: "clamp(20px, 2.4vw, 28px)",
                  padding: "0 22px", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 70,
                }}>0{i + 1}</div>
                <div style={{
                  color: theme.text, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600,
                  fontSize: "clamp(13px, 1.5vw, 18px)", lineHeight: 1.4,
                  padding: "16px 24px", display: "flex", alignItems: "center", flex: 1,
                }}>{pt}</div>
              </div>
            ))}
          </div>
        )}

        {!hasReasons && (
          <div style={{
            display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 14,
            padding: "16px 26px", background: `${theme.accent}22`,
            border: `2px dashed ${theme.accent}`, color: theme.glow,
            fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
            fontSize: "clamp(13px, 1.5vw, 17px)",
            letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 28,
            animation: "slideUp 0.6s 0.7s cubic-bezier(0.16,1,0.3,1) both",
            transform: "rotate(-1deg)", maxWidth: "92%",
          }}>
            <span style={{ fontSize: 26 }}>🤷</span>
            <span>No explanation. Just vibes.</span>
            <span style={{ fontSize: 26 }}>💅</span>
          </div>
        )}

        <div style={{
          padding: "24px 30px",
          background: `linear-gradient(135deg, ${theme.accent}22 0%, ${theme.accent2}11 100%)`,
          border: `3px solid ${theme.accent}`,
          animation: "slideUp 0.7s 1.1s cubic-bezier(0.16,1,0.3,1) both",
          maxWidth: 1000, position: "relative",
          boxShadow: `6px 6px 0 ${theme.accent2}66, 0 0 30px ${theme.accent}44`,
          transform: "rotate(-0.5deg)",
        }}>
          <div style={{
            position: "absolute", top: -12, left: 20,
            background: theme.accent, padding: "3px 10px",
            color: theme.bg, fontFamily: "'Bungee', sans-serif",
            fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
            boxShadow: `2px 2px 0 ${theme.bg}`,
          }}>★ Mic Drop ★</div>
          <p style={{
            color: theme.text, fontFamily: "'Bungee', sans-serif",
            fontSize: "clamp(10px, 1.3vw, 16px)", lineHeight: 1.4, margin: 0,
            textShadow: `1px 1px 0 ${theme.accent}`,
            textTransform: "uppercase", letterSpacing: "0", wordBreak: "break-word",
          }}>"{c.closingBurn}" <span style={{ color: theme.accent }}>🎤</span></p>
        </div>
      </div>
    </div>
  );
}

function CloseBtn({ onClose, theme }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClose(); }} style={{
      position: "absolute", top: 24, right: 24, zIndex: 5,
      background: theme.bg, border: `2px solid ${theme.accent}`,
      color: theme.accent, padding: "8px 14px",
      fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, cursor: "pointer",
      letterSpacing: 3, textTransform: "uppercase", fontWeight: 800,
    }}>Esc ✕</button>
  );
}

function NavHints({ theme }) {
  return (
    <div style={{
      position: "absolute", bottom: 24, right: 24, zIndex: 3,
      color: `${theme.text}66`, fontFamily: "'JetBrains Mono', monospace",
      fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
      display: "flex", gap: 12, alignItems: "center", fontWeight: 600,
    }}>
      <span>tap / → next</span>
    </div>
  );
}

function MysteryCard({ slide, index, presented }) {
  const theme = getTheme(index);
  return (
    <div style={{
      background: theme.bg, border: `2px solid ${presented ? theme.accent : theme.accent + "55"}`,
      padding: 22, minHeight: 200,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      position: "relative", overflow: "hidden",
      opacity: presented ? 0.55 : 1,
      boxShadow: presented ? "none" : `3px 3px 0 ${theme.accent}44`,
    }}>
      <ThemeShapes theme={theme} intensity={0.3} />
      <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
        <div style={{ fontSize: 50, marginBottom: 10, filter: presented ? "grayscale(1)" : "none" }}>
          {presented ? "✅" : "🎁"}
        </div>
        <div style={{
          color: theme.accent, fontFamily: "'Bungee', sans-serif",
          fontSize: 13, letterSpacing: 3, textTransform: "uppercase",
        }}>№{String(index + 1).padStart(2, "0")} · {slide.name}</div>
        <div style={{
          marginTop: 12, display: "inline-block",
          padding: "4px 12px", background: `${theme.accent}33`,
          color: theme.accent, fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700,
        }}>{presented ? "PRESENTED" : "🔒 SEALED"}</div>
      </div>
    </div>
  );
}

// ─── Guest View ───────────────────────────────────────────────────────────────
function GuestView({ onSubmit, submitted, onAnother, currentSlideCount }) {
  const [name, setName] = useState("");
  const [opinion, setOpinion] = useState("");
  const [reasons, setReasons] = useState(["", "", ""]);
  const [showReasons, setShowReasons] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const previewTheme = getTheme(currentSlideCount);

  const handleSubmit = async () => {
    if (!name.trim() || !opinion.trim()) { setError("Fill in your name and opinion!"); return; }
    setError(""); setLoading(true);
    try {
      const filteredReasons = reasons.map(r => r.trim()).filter(Boolean);
      const content = await generateSlideContent(name.trim(), opinion.trim(), filteredReasons);
      await onSubmit({ name: name.trim(), opinion: opinion.trim(), content, id: Date.now() + Math.floor(Math.random() * 1000) });
    } catch (err) {
      setError("Something went wrong — try again!");
    }
    setLoading(false);
  };

  const updateReason = (idx, val) => {
    const r = [...reasons]; r[idx] = val; setReasons(r);
  };

  if (submitted) return (
    <div style={{ textAlign: "center", padding: "60px 20px", position: "relative", maxWidth: 700, margin: "0 auto", overflow: "hidden" }}>
      <FloatingEmojis emojis={["🔥", "💯", "🎤", "👏", "✨"]} count={15} opacity={0.2} />
      <ConfettiBurst theme={previewTheme} count={30} />
      <div style={{ position: "relative", zIndex: 2 }}>
        <div style={{ fontSize: 100, marginBottom: 20, animation: "shake 0.5s ease infinite" }}>🔥</div>
        <h2 style={{
          fontFamily: "'Bungee', sans-serif",
          fontSize: "clamp(36px, 6vw, 56px)", margin: "0 0 16px",
          background: `linear-gradient(90deg, ${THEMES.map(t => t.accent).join(", ")})`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          backgroundSize: "200% 100%", animation: "rainbowShift 3s linear infinite",
          textTransform: "uppercase", letterSpacing: "-0.03em",
        }}>Locked & Loaded!</h2>
        <p style={{ color: "#aaa", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 13, letterSpacing: 4, textTransform: "uppercase" }}>
          Your take is sealed until showtime 🤐
        </p>
        <button onClick={onAnother} style={{
          marginTop: 32, background: "transparent", color: "#fff",
          border: "2px solid #fff", padding: "14px 32px",
          fontFamily: "'Bungee', sans-serif", fontSize: 12, letterSpacing: 3,
          textTransform: "uppercase", cursor: "pointer",
        }}>+ Add Another</button>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 20px", position: "relative" }}>
      <div style={{
        position: "absolute", top: 30, left: "50%", transform: "translateX(-50%)",
        width: "calc(100% - 40px)", maxWidth: 600, height: 280,
        background: `radial-gradient(ellipse, ${previewTheme.accent}33 0%, transparent 60%)`,
        pointerEvents: "none", filter: "blur(20px)",
      }} />

      <div style={{ textAlign: "center", marginBottom: 36, position: "relative" }}>
        <div style={{ fontSize: 72, marginBottom: 14, animation: "wiggle 2s ease infinite" }}>🎤</div>
        <h1 style={{
          color: "#fff", fontFamily: "'Bungee', sans-serif",
          fontSize: "clamp(40px, 8vw, 64px)", margin: "0 0 14px", lineHeight: 0.9,
          letterSpacing: "-0.03em", textTransform: "uppercase",
        }}>
          Drop Your<br />
          <span style={{
            background: `linear-gradient(90deg, ${previewTheme.accent} 0%, ${previewTheme.accent2} 100%)`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>Hot Take!</span>
        </h1>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "8px 18px", background: previewTheme.accent,
          color: previewTheme.bg, transform: "skewX(-6deg)",
          boxShadow: `4px 4px 0 ${previewTheme.glow}`,
        }}>
          <span style={{ fontSize: 18 }}>{previewTheme.emoji}</span>
          <p style={{ fontFamily: "'Bungee', sans-serif", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", margin: 0 }}>
            Theme: {previewTheme.name}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, position: "relative" }}>
        <div>
          <label style={{ color: "#aaa", fontFamily: "'Space Grotesk', sans-serif", fontSize: 10, letterSpacing: 3, textTransform: "uppercase", display: "block", marginBottom: 8, fontWeight: 800 }}>
            Your Name
          </label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="ALEX"
            maxLength={20}
            style={{
              width: "100%", background: "#0d0d0d", border: "2px solid #1e1e1e",
              padding: "14px 16px", color: "#fff",
              fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 17, outline: "none",
              boxSizing: "border-box", textTransform: "uppercase",
            }}
            onFocus={e => e.target.style.borderColor = previewTheme.accent}
            onBlur={e => e.target.style.borderColor = "#1e1e1e"} />
        </div>

        <div>
          <label style={{ color: "#aaa", fontFamily: "'Space Grotesk', sans-serif", fontSize: 10, letterSpacing: 3, textTransform: "uppercase", display: "block", marginBottom: 8, fontWeight: 800 }}>
            Your Unpopular Opinion <span style={{ color: previewTheme.accent }}>*</span>
          </label>
          <textarea value={opinion} onChange={e => setOpinion(e.target.value)}
            placeholder="Pineapple on pizza is actually elite. Fight me." rows={3}
            maxLength={200}
            style={{
              width: "100%", background: "#0d0d0d", border: "2px solid #1e1e1e",
              padding: "14px 16px", color: "#fff",
              fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, fontSize: 16, outline: "none",
              resize: "vertical", lineHeight: 1.5, boxSizing: "border-box",
            }}
            onFocus={e => e.target.style.borderColor = previewTheme.accent}
            onBlur={e => e.target.style.borderColor = "#1e1e1e"} />
          <div style={{ textAlign: "right", color: "#555", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, marginTop: 4 }}>
            {opinion.length}/200
          </div>
        </div>

        <div style={{ border: "2px dashed #1e1e1e", padding: 18 }}>
          <button onClick={() => setShowReasons(!showReasons)} style={{
            background: "transparent", border: "none", color: previewTheme.accent,
            fontFamily: "'Bungee', sans-serif", fontSize: 13,
            letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", padding: 0,
            display: "flex", alignItems: "center", gap: 8, width: "100%",
          }}>
            <span style={{ transform: showReasons ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s", display: "inline-block" }}>▶</span>
            <span>{showReasons ? "Hide" : "Add"} Your Reasons (Optional)</span>
            <span style={{ fontSize: 18, marginLeft: "auto" }}>🧠</span>
          </button>

          {showReasons && (
            <div style={{ marginTop: 16 }}>
              <p style={{ color: "#888", fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
                Want defense points on your slide? Add them here. Leave blank to skip. 💪
              </p>
              {reasons.map((r, i) => (
                <div key={i} style={{ marginBottom: 10, display: "flex", gap: 8 }}>
                  <div style={{
                    background: previewTheme.accent, color: "#000",
                    fontFamily: "'Bungee', sans-serif", fontSize: 14,
                    padding: "0 14px", display: "flex", alignItems: "center", minWidth: 40,
                  }}>0{i + 1}</div>
                  <input value={r} onChange={e => updateReason(i, e.target.value)}
                    placeholder={`Reason ${i + 1}...`}
                    maxLength={100}
                    style={{
                      flex: 1, background: "#0d0d0d", border: "1px solid #1e1e1e",
                      padding: "10px 12px", color: "#fff",
                      fontFamily: "'Space Grotesk', sans-serif", fontSize: 14,
                      outline: "none", boxSizing: "border-box",
                    }}
                    onFocus={e => e.target.style.borderColor = previewTheme.accent}
                    onBlur={e => e.target.style.borderColor = "#1e1e1e"} />
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div style={{ color: previewTheme.accent, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 13, padding: "12px 16px", background: `${previewTheme.accent}11`, border: `1px solid ${previewTheme.accent}44` }}>
            ⚠ {error}
          </div>
        )}

        <button onClick={handleSubmit} disabled={loading}
          style={{
            background: loading ? "#1a1a1a" : `linear-gradient(135deg, ${previewTheme.accent} 0%, ${previewTheme.accent2} 100%)`,
            color: loading ? "#555" : "#000",
            border: "none", padding: "18px",
            fontFamily: "'Bungee', sans-serif", fontSize: 14, letterSpacing: 3,
            textTransform: "uppercase", cursor: loading ? "wait" : "pointer",
            boxShadow: loading ? "none" : `4px 4px 0 ${previewTheme.glow}, 0 0 30px ${previewTheme.accent}66`,
          }}>
          {loading ? "⏳ Generating..." : "🔥 Lock In My Opinion →"}
        </button>
      </div>
    </div>
  );
}

// ─── Host View ────────────────────────────────────────────────────────────────
function HostView({ slides, onMarkPresented, onLogout, onRefresh }) {
  const [presentingIdx, setPresentingIdx] = useState(null);
  const [showWheel, setShowWheel] = useState(false);
  const [autoSpinTrigger, setAutoSpinTrigger] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const unpresented = slides.filter(s => !s.presented);
  const presentedCount = slides.filter(s => s.presented).length;

  const handlePickFromWheel = (winner) => {
    setShowWheel(false);
    const idx = slides.findIndex(s => s.id === winner.id);
    setPresentingIdx(idx);
  };

  const handlePresentFinish = async () => {
    if (presentingIdx !== null) {
      const slide = slides[presentingIdx];
      if (slide && !slide.presented) {
        await onMarkPresented(slide.id);
      }
    }
    setPresentingIdx(null);

    // Pull latest data from Google Sheets
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);

    setTimeout(() => setAutoSpinTrigger(prev => prev + 1), 300);
  };

  useEffect(() => {
    if (autoSpinTrigger === 0) return;
    const remaining = slides.filter(s => !s.presented);
    if (remaining.length > 0) {
      setShowWheel(true);
    }
  }, [autoSpinTrigger]);

  const doRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  return (
    <div style={{ padding: "32px 24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#fff", fontFamily: "'Bungee', sans-serif", fontSize: 36, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "-0.02em" }}>
            🎯 Host Dashboard
          </h2>
          <p style={{ color: "#888", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 11, letterSpacing: 2, margin: 0, textTransform: "uppercase" }}>
            {slides.length} in sheet · {presentedCount} presented · {unpresented.length} sealed
            {refreshing && <span style={{ marginLeft: 8, color: "#ff8800" }}>· syncing...</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={doRefresh} disabled={refreshing} style={{
            background: "transparent", color: refreshing ? "#444" : "#aaa", border: "2px solid #1e1e1e",
            padding: "8px 14px", fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700, fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
            cursor: refreshing ? "wait" : "pointer",
          }}>{refreshing ? "⏳ Syncing" : "🔄 Sync"}</button>
          <button onClick={onLogout} style={{
            background: "transparent", color: "#888", border: "2px solid #1e1e1e",
            padding: "8px 14px", fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer",
          }}>Lock 🔐</button>
        </div>
      </div>

      {unpresented.length > 0 && (
        <button onClick={() => setShowWheel(true)} style={{
          width: "100%", marginBottom: 22,
          background: `linear-gradient(90deg, ${THEMES.map(t => t.accent).join(", ")})`,
          backgroundSize: "200% 100%", color: "#fff", border: "none",
          padding: "28px", fontFamily: "'Bungee', sans-serif",
          fontSize: "clamp(22px, 4vw, 32px)", cursor: "pointer",
          boxShadow: "0 0 60px rgba(255,255,255,0.3)",
          textTransform: "uppercase", letterSpacing: "-0.02em",
          animation: "rainbowShift 4s linear infinite",
          textShadow: "3px 3px 0 rgba(0,0,0,0.4)",
        }}>
          🎡 Spin the Wheel!
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, letterSpacing: 4, textTransform: "uppercase", fontWeight: 700, opacity: 0.95, marginTop: 6 }}>
            {unpresented.length} sealed take{unpresented.length !== 1 ? "s" : ""} · pick the next victim
          </div>
        </button>
      )}

      {unpresented.length === 0 && slides.length > 0 && (
        <div style={{
          background: "#0a0a0a", border: "2px dashed #333",
          padding: "26px", marginBottom: 22, textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
          <div style={{ color: "#fff", fontFamily: "'Bungee', sans-serif", fontSize: 18, textTransform: "uppercase", letterSpacing: 1 }}>
            All takes presented!
          </div>
        </div>
      )}

      {slides.length > 0 && (
        <div style={{
          background: "#0a0a0a", border: "1px solid #222",
          padding: "12px 16px", marginBottom: 22,
          color: "#888", fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 11, letterSpacing: 1, lineHeight: 1.5,
        }}>
          💡 The Google Sheet is the source of truth. To remove someone, delete their row. To un-present someone, clear their "presented" column in the sheet, then hit 🔄 Sync.
        </div>
      )}

      {slides.length === 0 ? (
        <div style={{ textAlign: "center", padding: "100px 20px", color: "#444", fontFamily: "'Bungee', sans-serif", fontSize: 24, textTransform: "uppercase", letterSpacing: 1 }}>
          No submissions yet 👀<br />
          <span style={{ fontSize: 13, letterSpacing: 3, color: "#333" }}>
            Share the link!
          </span>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {slides.map((slide, i) => (
            <MysteryCard key={slide.id} slide={slide} index={i} presented={slide.presented} />
          ))}
        </div>
      )}

      {showWheel && (
        <SpinWheel
          candidates={unpresented}
          onPick={handlePickFromWheel}
          onCancel={() => setShowWheel(false)}
          autoSpin={autoSpinTrigger > 0}
        />
      )}

      {presentingIdx !== null && (
        <PresenterMode
          slides={slides}
          startIndex={presentingIdx * 2}
          onClose={() => setPresentingIdx(null)}
          onFinish={handlePresentFinish}
        />
      )}
    </div>
  );
}

function PasswordGate({ onUnlock }) {
  const [pw, setPw] = useState("");
  const [shake, setShake] = useState(false);
  const attempt = () => {
    if (pw === HOST_PASSWORD) onUnlock();
    else { setShake(true); setPw(""); setTimeout(() => setShake(false), 600); }
  };

  return (
    <div style={{ maxWidth: 380, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
      <div style={{ fontSize: 72, marginBottom: 18, animation: "wiggle 2s ease infinite" }}>🔐</div>
      <h2 style={{
        color: "#fff", fontFamily: "'Bungee', sans-serif",
        fontSize: 36, margin: "0 0 26px", textTransform: "uppercase",
      }}>Host Access</h2>
      <input type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && attempt()}
        placeholder="Enter password"
        style={{
          width: "100%", background: "#0d0d0d",
          border: `2px solid ${shake ? "#ff2d2d" : "#1e1e1e"}`,
          padding: "14px 16px", color: "#fff",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 14, outline: "none",
          boxSizing: "border-box", marginBottom: 12,
          animation: shake ? "shake 0.5s" : "none", textAlign: "center", letterSpacing: 2,
        }} />
      <button onClick={attempt} style={{
        width: "100%",
        background: `linear-gradient(90deg, ${THEMES.map(t => t.accent).join(", ")})`,
        backgroundSize: "200% 100%", animation: "rainbowShift 4s linear infinite",
        color: "#000", border: "none", padding: "14px",
        fontFamily: "'Bungee', sans-serif", fontSize: 14,
        letterSpacing: 3, textTransform: "uppercase", cursor: "pointer",
      }}>Enter</button>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("guest");
  const [slides, setSlides] = useState([]); // every slide has a .presented bool from sheet
  const [submitted, setSubmitted] = useState(false);
  const [ready, setReady] = useState(false);

  const refreshFromSheets = async () => {
    const remote = await loadFromSheets();
    setSlides(remote);
  };

  useEffect(() => {
    (async () => {
      await refreshFromSheets();
      setReady(true);
    })();
  }, []);

  const handleSubmit = async (slide) => {
    // Optimistically add locally, then sync to sheet, then refresh from sheet
    await syncToSheets(slide);
    // Wait a beat for sheet to register, then refresh from sheet
    setTimeout(refreshFromSheets, 1500);
    setSubmitted(true);
  };

  const handleMarkPresented = async (id) => {
    // Mark in sheet AND optimistically update local state
    await markPresentedInSheet(id);
    setSlides(prev => prev.map(s => s.id === id ? { ...s, presented: true } : s));
  };

  if (!ready) return (
    <div style={{ minHeight: "100vh", background: "#050505", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#333", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 3 }}>LOADING...</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#050505", color: "#fff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bungee&family=Space+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #050505; }
        @keyframes slideEnter { from { opacity:0; transform:translateY(30px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes slideUp { from { opacity:0; transform:translateY(40px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideRight { from { opacity:0; transform:translateX(-40px); } to { opacity:1; transform:translateX(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes popIn { from { opacity:0; transform:scale(0) rotate(-180deg); } to { opacity:1; transform:scale(1) rotate(0deg); } }
        @keyframes popInBig { from { opacity:0; transform:scale(0.3) rotate(-15deg); } to { opacity:1; transform:scale(1) rotate(0deg); } }
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }
        @keyframes wiggle { 0%,100%{transform:rotate(-3deg)} 50%{transform:rotate(3deg)} }
        @keyframes rainbowShift { 0%{background-position: 0% 50%} 100%{background-position: 200% 50%} }
        @keyframes floatSlow { 0%,100%{transform:translate(0,0) rotate(0deg)} 33%{transform:translate(20px,-20px) rotate(5deg)} 66%{transform:translate(-15px,15px) rotate(-3deg)} }
        @keyframes floatBob { 0%,100%{transform:translate(0,0) rotate(0deg)} 50%{transform:translate(15px,-25px) rotate(15deg)} }
        @keyframes spinSlow { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(120vh) rotate(720deg); opacity: 0; }
        }
        input::placeholder, textarea::placeholder { color: #333; }
      `}</style>

      <div style={{ borderBottom: "1px solid #111", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <span style={{
          fontFamily: "'Bungee', sans-serif", fontSize: 22,
          background: `linear-gradient(90deg, ${THEMES.map(t => t.accent).join(", ")})`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          backgroundSize: "200% 100%", animation: "rainbowShift 4s linear infinite",
          textTransform: "uppercase", letterSpacing: "-0.02em",
        }}>🔥 Unpopular Opinions Night</span>
        <div style={{ display: "flex", gap: 7 }}>
          <button onClick={() => setView("guest")} style={{
            background: view === "guest" ? "#fff" : "transparent",
            color: view === "guest" ? "#000" : "#888",
            border: `2px solid ${view === "guest" ? "#fff" : "#1a1a1a"}`,
            padding: "8px 16px", fontFamily: "'Bungee', sans-serif",
            fontSize: 10, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer",
          }}>Guest</button>
          <button onClick={() => setView("host-gate")} style={{
            background: view === "host" ? "#fff" : "transparent",
            color: view === "host" ? "#000" : "#888",
            border: `2px solid ${view === "host" ? "#fff" : "#1a1a1a"}`,
            padding: "8px 16px", fontFamily: "'Bungee', sans-serif",
            fontSize: 10, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer",
          }}>Host 🎯</button>
        </div>
      </div>

      {!SHEETS_URL && (
        <div style={{
          background: "#3d0000", borderBottom: "2px solid #ff2d2d",
          padding: "10px 20px", textAlign: "center",
          color: "#ffaaaa", fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 12, fontWeight: 700,
        }}>
          ⚠️ VITE_SHEETS_URL not configured — submissions save locally only. Check .env and restart dev server.
        </div>
      )}
      {!ANTHROPIC_KEY && (
        <div style={{
          background: "#3d2200", borderBottom: "2px solid #ff8800",
          padding: "10px 20px", textAlign: "center",
          color: "#ffcc88", fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 12, fontWeight: 700,
        }}>
          ⚠️ VITE_ANTHROPIC_KEY not configured — slides will use raw text without AI polish.
        </div>
      )}

      {view === "guest" && <GuestView onSubmit={handleSubmit} submitted={submitted} onAnother={() => setSubmitted(false)} currentSlideCount={slides.length} />}
      {view === "host-gate" && <PasswordGate onUnlock={() => setView("host")} />}
      {view === "host" && <HostView slides={slides} onMarkPresented={handleMarkPresented} onLogout={() => setView("guest")} onRefresh={refreshFromSheets} />}
    </div>
  );
}