import { Lock } from "lucide-react";
import { CANVAS } from "../../lib/creqTemplates";
import { elementBounds } from "./utils";

/** Premium selection chrome for the Create EQ canvas — bounding border, resize
 * handles, rotation handle, and the live X,Y / W×H / angle HUD.
 *
 * The canvas is a fixed 1080×1350 div scaled by `transform: scale(zoom)`, so
 * anything sized in canvas px shrinks with zoom — the old 12px handles read as
 * ~4.5px at the default 38% zoom, which is exactly why selection felt cheap.
 * Every dimension here is divided by zoom so the chrome is pixel-constant on
 * SCREEN at any zoom level, the way Figma/Canva draw theirs.
 *
 * Rendered only in the live editor (never mounted in the export tree), so
 * nothing here can leak into PNG/PDF output. */

const ACCENT = "#1D1D1F";
const LOCKED = "#9CA3AF";

const CORNERS = ["nw", "ne", "se", "sw"];
const EDGES = ["n", "e", "s", "w"];

// The 8-direction cursor ring, rotated in 45° buckets so a corner handle on a
// rotated element still shows a sensible arrow direction.
const CURSOR_RING = ["nwse-resize", "ns-resize", "nesw-resize", "ew-resize", "nwse-resize", "ns-resize", "nesw-resize", "ew-resize"];
const RING_INDEX = { nw: 0, n: 1, ne: 2, e: 3, se: 4, s: 5, sw: 6, w: 7 };
function cursorFor(pos, rotate) {
  const shift = Math.round((((rotate || 0) % 360) + 360) % 360 / 45) % 8;
  return CURSOR_RING[(RING_INDEX[pos] + shift) % 8];
}

function handlePlacement(pos, w, h) {
  const cx = { n: w / 2, s: w / 2, w: 0, e: w, nw: 0, ne: w, sw: 0, se: w }[pos];
  const cy = { n: 0, s: h, w: h / 2, e: h / 2, nw: 0, ne: 0, sw: h, se: h }[pos];
  return { left: cx, top: cy };
}

function SingleChrome({ el, bounds, zoom, onResizeStart, onRotateStart }) {
  const z = (v) => v / zoom;
  const locked = !!el.locked;
  const color = locked ? LOCKED : ACCENT;
  const rotate = el.rotate || 0;
  // Edge pills clutter small selections and mislead on rotated ones (resize
  // math is axis-aligned) — corners only in both cases.
  const showEdges = !locked && bounds.w * zoom > 48 && bounds.h * zoom > 48 && Math.abs(rotate) <= 10;

  const handleBase = {
    position: "absolute",
    background: "#FFFFFF",
    border: `${z(1.5)}px solid ${color}`,
    boxShadow: `0 ${z(1)}px ${z(4)}px rgba(0,0,0,0.25)`,
    pointerEvents: "auto",
    transform: "translate(-50%, -50%)",
    zIndex: 2,
  };

  return (
    <div style={{
      position: "absolute", left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h,
      transform: rotate ? `rotate(${rotate}deg)` : undefined,
      pointerEvents: "none", zIndex: 50,
    }} data-testid="selection-chrome">
      {/* Bounding border */}
      <div style={{ position: "absolute", inset: 0, border: `${z(1.5)}px solid ${color}` }} />

      {locked ? (
        <div style={{
          position: "absolute", top: z(-10), right: z(-10),
          width: z(20), height: z(20), borderRadius: 999,
          background: LOCKED, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} data-testid="selection-lock-glyph">
          <Lock size={z(11)} strokeWidth={2.5} />
        </div>
      ) : (
        <>
          {/* Corner handles — circles, constant screen size */}
          {CORNERS.map((pos) => (
            <div key={pos} data-testid={`resize-${pos}`}
              onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e, el, pos); }}
              style={{
                ...handleBase, ...handlePlacement(pos, bounds.w, bounds.h),
                width: z(10), height: z(10), borderRadius: 999,
                cursor: cursorFor(pos, rotate),
              }} />
          ))}
          {/* Edge handles — pills, only when there's room and near-zero rotation */}
          {showEdges && EDGES.map((pos) => {
            const horizontal = pos === "n" || pos === "s";
            return (
              <div key={pos} data-testid={`resize-${pos}`}
                onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e, el, pos); }}
                style={{
                  ...handleBase, ...handlePlacement(pos, bounds.w, bounds.h),
                  width: horizontal ? z(18) : z(6), height: horizontal ? z(6) : z(18),
                  borderRadius: 999,
                  cursor: cursorFor(pos, rotate),
                }} />
            );
          })}
          {/* Rotation handle — detached below the element on a thin stem */}
          {onRotateStart && (
            <>
              <div style={{
                position: "absolute", left: "50%", top: "100%",
                width: z(1), height: z(16), background: color,
                transform: "translateX(-50%)",
              }} />
              <div data-testid="rotate-handle" className="creq-rotate-cursor"
                onPointerDown={(e) => { e.stopPropagation(); onRotateStart(e, el); }}
                style={{
                  ...handleBase,
                  left: "50%", top: `calc(100% + ${z(24)}px)`,
                  width: z(14), height: z(14), borderRadius: 999,
                }} />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function SelectionChrome({ els, zoom, measured, interaction, onResizeStart, onRotateStart, onGroupResizeStart }) {
  if (!els?.length) return null;
  const z = (v) => v / zoom;
  const boundsList = els.map((el) => elementBounds(el, measured));

  // Union bbox (unrotated) — anchors the group chrome and the HUD.
  const minX = Math.min(...boundsList.map((b) => b.x));
  const minY = Math.min(...boundsList.map((b) => b.y));
  const maxX = Math.max(...boundsList.map((b) => b.x + b.w));
  const maxY = Math.max(...boundsList.map((b) => b.y + b.h));
  const union = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

  const multi = els.length > 1;
  const anyUnlocked = els.some((e) => !e.locked);

  // HUD flips above the selection when it would run off the canvas bottom.
  // The rotation handle occupies ~40 screen-px below single selections, so the
  // below-position clears it.
  const hudBelow = union.y + union.h < CANVAS.h - 140;

  return (
    <>
      {multi ? (
        <>
          {/* Per-element thin outlines */}
          {els.map((el, i) => {
            const b = boundsList[i];
            return (
              <div key={el.id} style={{
                position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h,
                transform: el.rotate ? `rotate(${el.rotate}deg)` : undefined,
                border: `${z(1)}px solid ${el.locked ? LOCKED : ACCENT}`,
                pointerEvents: "none", zIndex: 49,
              }} />
            );
          })}
          {/* Union bbox with group-scale corner handles */}
          <div data-testid="group-chrome" style={{
            position: "absolute", left: union.x, top: union.y, width: union.w, height: union.h,
            border: `${z(1)}px dashed ${ACCENT}`,
            pointerEvents: "none", zIndex: 50,
          }}>
            {anyUnlocked && onGroupResizeStart && CORNERS.map((pos) => (
              <div key={pos} data-testid={`group-resize-${pos}`}
                onPointerDown={(e) => { e.stopPropagation(); onGroupResizeStart(e, pos); }}
                style={{
                  position: "absolute", ...handlePlacement(pos, union.w, union.h),
                  width: z(10), height: z(10), borderRadius: 999,
                  background: "#FFFFFF", border: `${z(1.5)}px solid ${ACCENT}`,
                  boxShadow: `0 ${z(1)}px ${z(4)}px rgba(0,0,0,0.25)`,
                  transform: "translate(-50%, -50%)",
                  cursor: cursorFor(pos, 0), pointerEvents: "auto",
                }} />
            ))}
          </div>
        </>
      ) : (
        <SingleChrome el={els[0]} bounds={boundsList[0]} zoom={zoom}
          onResizeStart={onResizeStart} onRotateStart={onRotateStart} />
      )}

      {/* Live HUD — X,Y while dragging, W×H while resizing, angle while rotating */}
      {interaction?.label && (
        <div data-testid="interaction-hud" style={{
          position: "absolute",
          left: union.x + union.w / 2,
          top: hudBelow ? union.y + union.h + z(44) : union.y - z(36),
          transform: "translateX(-50%)",
          background: "#1D1D1F", color: "#FFFFFF",
          fontFamily: '"JetBrains Mono", monospace', fontSize: z(11), lineHeight: 1,
          padding: `${z(5)}px ${z(9)}px`, borderRadius: 999,
          whiteSpace: "nowrap", pointerEvents: "none", zIndex: 60,
          boxShadow: `0 ${z(2)}px ${z(8)}px rgba(0,0,0,0.35)`,
        }}>
          {interaction.label}
        </div>
      )}
    </>
  );
}
