// Top-level router. /deck mirrors the submission PDF as a webpage.
import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { Agent } from "./pages/Agent.js";
import { Atlas } from "./pages/Atlas.js";
import { Deck } from "./pages/Deck.js";
import { Developers } from "./pages/Developers.js";
import { Diagnose } from "./pages/Diagnose.js";
import { Landing } from "./pages/Landing.js";
import { Report } from "./pages/Report.js";
import { Roadmap } from "./pages/Roadmap.js";

export function App() {
  useEffect(() => {
    const el = document.getElementById("lp-splash");
    if (!el) return;
    let t2: ReturnType<typeof setTimeout>;
    const t1 = setTimeout(() => {
      el.classList.add("lp-splash--exit");
      t2 = setTimeout(() => el.remove(), 460);
    }, 400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/atlas" element={<Atlas />} />
      <Route path="/agent" element={<Agent />} />
      <Route path="/developers" element={<Developers />} />
      <Route path="/deck" element={<Deck />} />
      <Route path="/diagnose/:tokenId" element={<Diagnose />} />
      <Route path="/report/:rootHash" element={<Report />} />
      <Route path="/roadmap" element={<Roadmap />} />
    </Routes>
  );
}
