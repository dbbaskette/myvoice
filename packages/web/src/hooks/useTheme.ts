import { useEffect } from "react";

export function useTheme(theme: "light" | "dark" | "system"): void {
  useEffect(() => {
    const root = document.documentElement;
    const resolve = () => {
      if (theme === "system") {
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        root.classList.toggle("dark", dark);
      } else {
        root.classList.toggle("dark", theme === "dark");
      }
    };
    resolve();
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", resolve);
      return () => mq.removeEventListener("change", resolve);
    }
  }, [theme]);
}
