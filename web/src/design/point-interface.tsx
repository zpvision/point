"use client";
import { useEffect } from "react";
export default function PointInterface() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "/point-languages.js?v=16";
    script.dataset.pointLanguages = "true";
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);
  return null;
}
