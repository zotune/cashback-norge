import { useEffect, useRef } from "react";
import { mountThemeControl } from "../../shared/theme";
import { extensionTheme } from "../theme";

export function ThemeControl() {
  const slot = useRef<HTMLDivElement>(null);
  useEffect(() => slot.current ? mountThemeControl(extensionTheme, slot.current) : undefined, []);
  return <div ref={slot} />;
}
