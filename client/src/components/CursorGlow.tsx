import { useState, useEffect, useCallback } from "react";

export function CursorGlow() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    setPosition({ x: e.clientX, y: e.clientY });
    setIsVisible(true);
  }, []);

  const handlePointerLeave = useCallback(() => {
    setIsVisible(false);
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    document.documentElement.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      document.documentElement.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [handlePointerMove, handlePointerLeave]);

  if (!isVisible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="absolute rounded-full transition-opacity duration-150"
        style={{
          left: position.x,
          top: position.y,
          width: 300,
          height: 300,
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, hsla(165, 85%, 45%, 0.15) 0%, hsla(165, 85%, 45%, 0.05) 40%, transparent 70%)",
          filter: "blur(8px)",
        }}
      />
    </div>
  );
}
