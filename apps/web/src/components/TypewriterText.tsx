import { useEffect, useState } from "react";

interface Props {
  text: string;
  speedMs?: number;
}

// Streams a string character by character. Used for the live agent
// narrative so the demo feels like the agent is "thinking out loud".
export function TypewriterText({ text, speedMs = 20 }: Props) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    setShown("");
    if (!text) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, speedMs);
    return () => window.clearInterval(id);
  }, [text, speedMs]);

  return <span>{shown}</span>;
}
