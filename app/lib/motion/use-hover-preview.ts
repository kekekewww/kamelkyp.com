import { type RefObject, useEffect, useRef, useState } from "react";
import { loop } from "./frame";
import { getMotionTier } from "./reduced-motion";
import { lerpFactor } from "./tokens";

/**
 * Hover preview for project lists (docs/motion-system.md §2.4).
 *
 * Markup contract (pure data attributes, no props drilled into rows):
 *   <div ref={listRef} class="…" (position: relative)>
 *     <ul> <li><a class="project-row" data-preview-id="slug">…</a></li> … </ul>
 *     <div ref={previewRef} class="hover-preview" aria-hidden="true">
 *       <img class="hover-preview__item" data-preview-for="slug" alt="" loading="lazy" decoding="async" />
 *       (or a procedural cover element with the same class + data-preview-for)
 *     </div>
 *   </div>
 *
 * The hook sets `data-visible` on the preview, `data-active` on the matching
 * item and writes `transform` via the CSSOM. Pointer (mouse/pen) follows with
 * lag in tier "full"; keyboard focus and reduced motion anchor the preview to
 * the row's right columns. Touch devices never show it (CSS hides it).
 */
export function useHoverPreview(listRef: RefObject<HTMLElement | null>): {
  previewRef: RefObject<HTMLDivElement | null>;
  activeId: string | null;
} {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const list = listRef.current;
    const preview = previewRef.current;
    if (!list || !preview || typeof window === "undefined") return;

    const follow = getMotionTier() === "full";
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let stopLoop: (() => void) | null = null;
    let decoded = false;
    let current: string | null = null;

    const write = () => {
      preview.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    const setActive = (id: string | null) => {
      if (id === current) return;
      current = id;
      setActiveId(id);
      for (const item of preview.querySelectorAll<HTMLElement>(
        "[data-preview-for]",
      )) {
        item.toggleAttribute("data-active", item.dataset.previewFor === id);
      }
      preview.toggleAttribute("data-visible", id !== null);
    };

    const clamp = (px: number, py: number) => {
      const listRect = list.getBoundingClientRect();
      const w = preview.offsetWidth;
      const h = preview.offsetHeight;
      // design-system §6.8: the preview never covers the row's own title
      // (cols 2–7), so it is clamped to cols 8–12.
      const minX = listRect.width * (7 / 12);
      return {
        x: Math.max(minX, Math.min(listRect.width - w, px)),
        y: Math.max(0, Math.min(listRect.height - h, py)),
      };
    };

    const anchorTo = (row: HTMLElement) => {
      const listRect = list.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      // Right columns (≈ cols 9–11), vertically centred on the row.
      const pos = clamp(
        listRect.width * (8 / 12),
        rowRect.top -
          listRect.top +
          rowRect.height / 2 -
          preview.offsetHeight / 2,
      );
      stopLoop?.();
      stopLoop = null;
      x = pos.x;
      y = pos.y;
      targetX = x;
      targetY = y;
      write();
    };

    const decodeAll = () => {
      if (decoded) return;
      decoded = true;
      const images = Array.from(
        preview.querySelectorAll<HTMLImageElement>("img[data-preview-for]"),
      ).slice(0, 12);
      for (const image of images) {
        image.loading = "eager";
        image.decode?.().catch(() => undefined);
      }
    };

    const startLoop = () => {
      if (stopLoop) return;
      preview.style.willChange = "transform, opacity";
      stopLoop = loop((_now, dt) => {
        const k = lerpFactor(0.18, dt);
        x += (targetX - x) * k;
        y += (targetY - y) * k;
        write();
        if (Math.abs(targetX - x) < 0.25 && Math.abs(targetY - y) < 0.25) {
          stopLoop = null;
          return false;
        }
        return undefined;
      });
    };

    const rowFrom = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<HTMLElement>("[data-preview-id]")
        : null;

    const onEnter = () => decodeAll();

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const row = rowFrom(event.target);
      if (!row) return;
      const id = row.dataset.previewId ?? null;
      const wasHidden = current === null;
      setActive(id);
      if (!follow) {
        anchorTo(row);
        return;
      }
      const listRect = list.getBoundingClientRect();
      const pos = clamp(
        event.clientX - listRect.left + 24,
        event.clientY - listRect.top - preview.offsetHeight / 2,
      );
      targetX = pos.x;
      targetY = pos.y;
      if (wasHidden) {
        x = targetX;
        y = targetY;
        write();
      }
      startLoop();
    };

    const onLeave = () => {
      stopLoop?.();
      stopLoop = null;
      preview.style.willChange = "";
      setActive(null);
    };

    const onFocusIn = (event: FocusEvent) => {
      const row = rowFrom(event.target);
      if (!row) return;
      decodeAll();
      setActive(row.dataset.previewId ?? null);
      anchorTo(row);
    };

    const onFocusOut = (event: FocusEvent) => {
      if (!list.contains(event.relatedTarget as Node | null)) setActive(null);
    };

    list.addEventListener("pointerenter", onEnter, { passive: true });
    list.addEventListener("pointermove", onMove, { passive: true });
    list.addEventListener("pointerleave", onLeave, { passive: true });
    list.addEventListener("focusin", onFocusIn);
    list.addEventListener("focusout", onFocusOut);
    return () => {
      list.removeEventListener("pointerenter", onEnter);
      list.removeEventListener("pointermove", onMove);
      list.removeEventListener("pointerleave", onLeave);
      list.removeEventListener("focusin", onFocusIn);
      list.removeEventListener("focusout", onFocusOut);
      stopLoop?.();
    };
  }, [listRef]);

  return { previewRef, activeId };
}
