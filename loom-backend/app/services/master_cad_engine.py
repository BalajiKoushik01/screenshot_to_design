"""Master Jacquard CAD Synthesizer Engine — Truly Dynamic & Adaptive.

Synthesizes high-precision, authentic Indian Jacquard CAD graph sheets:
  1. Isolated Body File (Interlocking jaal / repeating buttas with ground tabby binders)
  2. Isolated Pallu File (Grand multi-tiered ceremonial royal endpiece medallion)
  3. Isolated Border File (Multi-tier architectural Kanchipuram / Banarasi border)
  4. Composite Saree Draft (Assembled according to detected layout architecture)
  5. Weft Separations (1-bit monochrome Zari '_jeri' and Silk Tabby '_ani' punch cards)

Matches the exact visual craftsmanship, density, and binary precision of traditional
Indian textile CAD software (sample 05 Body, sample 06 Border, 480 broket).
Each pixel represents exactly 1 needle hook on the Jacquard loom (0 anti-aliasing).
"""

from __future__ import annotations

import cv2
import numpy as np
from typing import Tuple, Optional, Dict, Any
from app.services.cloud_ai_agent import SareePatternAnalysis


class MasterCadEngine:
    """High-precision, adaptive Jacquard CAD graph sheet synthesizer."""

    DEFAULT_HOOKS = 240
    DEFAULT_PICKS = 1536

    # ──────────────────────────────────────────────────────────────────────────
    # 1. Helper Drawing Primitives (High-Density Binary Textile CAD)
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    def draw_rope(cad: np.ndarray, y_start: int, height: int = 4):
        """Draw 1px diagonal twisted zari rope border."""
        H, W = cad.shape[:2]
        for dy in range(height):
            y = y_start + dy
            if 0 <= y < H:
                for x in range(W):
                    if (x + dy) % 4 in (0, 1):
                        cad[y, x] = 255

    @staticmethod
    def draw_muthu_beads(cad: np.ndarray, y_start: int):
        """Draw South Indian muthu (pearl) bead chain with rules and solid beads."""
        H, W = cad.shape[:2]
        if y_start + 8 > H:
            return
        cad[y_start, :] = 255
        cad[y_start + 1, :] = 0
        cad[y_start + 6, :] = 0
        cad[y_start + 7, :] = 255
        # Solid 3x2 oval beads spaced every 6 hooks
        for x in range(0, W, 6):
            cad[y_start + 2:y_start + 6, (x + 1) % W:(x + 5) % W] = 255

    @staticmethod
    def draw_temple_kalgi(cad: np.ndarray, y_start: int, y_end: int, arch_w: int = 40):
        """Draw traditional temple kalgi / gopuram spearhead chevrons with rich infill."""
        H, W = cad.shape[:2]
        kh = y_end - y_start
        if kh <= 0:
            return
        num_arches = max(1, W // arch_w)
        for a in range(num_arches):
            cx = a * arch_w + arch_w // 2
            for y in range(y_start, min(H, y_end)):
                ny = (y - y_start) / float(kh)
                span = int((1.0 - ny) * (arch_w // 2 - 1))
                if span >= 0:
                    # 2px outer spearhead walls
                    cad[y, (cx - span) % W] = 255
                    cad[y, (cx - max(0, span - 1)) % W] = 255
                    cad[y, (cx + span) % W] = 255
                    cad[y, (cx + max(0, span - 1)) % W] = 255
                    # Inner cross-hatch spearhead texture
                    if span > 3 and ny < 0.80:
                        if (y + cx) % 3 == 0 or (y - cx) % 3 == 0:
                            cad[y, (cx - span + 2) % W:(cx + span - 1) % W] = 255
                    # Center spine
                    if ny < 0.65:
                        cad[y, (cx - 1) % W:(cx + 2) % W] = 255

    @staticmethod
    def draw_veldhari(cad: np.ndarray, y_start: int, y_end: int, dw: int = 24):
        """Draw interlocking diamond chevrons (Veldhari / Rudraksh) with center gems."""
        H, W = cad.shape[:2]
        dh = y_end - y_start
        if dh <= 0:
            return
        num_diamonds = max(1, W // dw)
        for a in range(num_diamonds):
            bx = a * dw
            for dy in range(dh):
                y = y_start + dy
                if 0 <= y < H:
                    ny = dy / float(dh - 1)
                    span = int(abs(ny - 0.5) * 2 * (dw // 2 - 1))
                    cad[y, (bx + dw // 2 - span) % W] = 255
                    cad[y, (bx + dw // 2 + span) % W] = 255
                    if span > 1:
                        cad[y, (bx + dw // 2 - span + 1) % W] = 255
                        cad[y, (bx + dw // 2 + span - 1) % W] = 255
                    # Center diamond gem
                    if abs(ny - 0.5) < 0.25:
                        cad[y, (bx + dw // 2 - 1) % W:(bx + dw // 2 + 2) % W] = 255

    @staticmethod
    def draw_floral_creeper(cad: np.ndarray, y_start: int, y_end: int, period: int = 60):
        """Draw running sinusoidal floral creeper (Kodi Visiri) with blooming rosettes and leaves."""
        H, W = cad.shape[:2]
        vh = y_end - y_start
        if vh <= 0:
            return
        mid_y = y_start + vh // 2

        for x in range(W):
            phase = (x % period) / float(period) * 2 * np.pi
            sy = int(mid_y + (vh * 0.32) * np.sin(phase))
            # 2px thick vine stem
            for dy in range(-1, 2):
                py = min(H - 1, max(0, sy + dy))
                cad[py, x] = 255

            # 6-petal blooming flower rosettes at wave crests & troughs
            if x % period in (period // 4, 3 * period // 4):
                fy = min(H - 1, max(0, sy))
                cv2.circle(cad, (x, fy), 5, 255, -1)
                cv2.circle(cad, (x, fy), 2, 0, -1)
            # Curved leaf tendrils
            elif x % period in (period // 8, 3 * period // 8, 5 * period // 8, 7 * period // 8):
                dir_y = -1 if x % period < period // 2 else 1
                for l in range(2, 8):
                    ly = min(H - 1, max(0, sy + dir_y * l))
                    for lx_off in range(2):
                        cad[ly, (x + l + lx_off) % W] = 255

    # ──────────────────────────────────────────────────────────────────────────
    # 2. Section Builders: Body, Pallu, and Border
    # ──────────────────────────────────────────────────────────────────────────

    @classmethod
    def build_body_draft(
        cls,
        hooks: int = 240,
        picks: int = 960,
        butta_binary: Optional[np.ndarray] = None,
        repeat_arrangement: str = "half_drop",
        layout_type: str = "single_border_and_body",
    ) -> np.ndarray:
        """Synthesize the isolated Body CAD draft matching traditional Indian silk brocades.

        Creates an interlocking brocade jaal or perfectly spaced half-drop butta repeat
        with authentic 1-pixel Jacquard ground tie-downs (like sample 05 Body).
        """
        cad = np.zeros((picks, hooks), dtype=np.uint8)

        # Standard Jacquard tile repeat: 80 hooks wide x 80 picks tall (3 repeats across 240 hooks)
        tw = 80 if hooks % 80 == 0 else (hooks // 3 if hooks >= 240 else 60)
        th = 80
        cols = hooks // tw
        rows = picks // th

        # Prepare base butta motif
        if butta_binary is not None and butta_binary.size > 0:
            bh, bw = butta_binary.shape[:2]
            # Target size inside tile: approx 48 hooks wide x 56 picks tall
            mw = min(tw - 16, max(36, int(tw * 0.60)))
            mh = min(th - 16, max(44, int(bh * (mw / max(1, bw)))))
            motif = cv2.resize(butta_binary, (mw, mh), interpolation=cv2.INTER_NEAREST)
        else:
            # High-craftsmanship synthetic paisley booti
            mw, mh = 46, 56
            motif = np.zeros((mh, mw), dtype=np.uint8)
            cx, cy = mw // 2, int(mh * 0.60)
            # Outer bell body
            cv2.ellipse(motif, (cx, cy), (int(mw * 0.40), int(mh * 0.32)), 0, 0, 360, 255, -1)
            cv2.ellipse(motif, (cx, cy), (int(mw * 0.26), int(mh * 0.20)), 0, 0, 360, 0, -1)
            # Center flower rosette
            cv2.circle(motif, (cx, cy), int(mw * 0.14), 255, -1)
            cv2.circle(motif, (cx, cy), 2, 0, -1)
            # Pointed curved paisley crest
            pts_crest = np.array([
                [cx - 8, int(mh * 0.35)],
                [cx + 8, int(mh * 0.08)],
                [cx + 16, int(mh * 0.18)],
                [cx + 6, int(mh * 0.42)]
            ], np.int32)
            cv2.fillPoly(motif, [pts_crest], 255)
            # Tapering stem base
            cv2.rectangle(motif, (cx - 4, int(mh * 0.88)), (cx + 4, mh - 2), 255, -1)

        mh, mw = motif.shape[:2]

        # Tile across all rows and columns with half-drop shift
        for r in range(rows + 2):
            shift_x = (tw // 2) if (repeat_arrangement == "half_drop" and r % 2 == 1) else 0
            y_base = r * th
            for c in range(cols + 2):
                x_base = (c * tw + shift_x - tw) % hooks

                # 1. Stamp centered motif
                mx_pos = x_base + (tw - mw) // 2
                my_pos = y_base + (th - mh) // 2

                for dy in range(mh):
                    py = my_pos + dy
                    if 0 <= py < picks:
                        for dx in range(mw):
                            if motif[dy, dx] > 128:
                                px = (mx_pos + dx) % hooks
                                cad[py, px] = 255

                # 2. Interlocking diamond jaal trellis vines ONLY if jaal layout is detected
                if layout_type == "all_over_brocade" or "jaal" in layout_type:
                    for t in range(1, tw // 2):
                        px1 = (x_base + t) % hooks
                        px2 = (x_base + tw - t) % hooks
                        py1 = y_base + t
                        py2 = y_base + th - t
                        if 0 <= py1 < picks:
                            cad[py1, px1] = 255
                            cad[py1, (px1 + 1) % hooks] = 255
                            cad[py1, px2] = 255
                            cad[py1, (px2 + 1) % hooks] = 255
                        if 0 <= py2 < picks:
                            cad[py2, px1] = 255
                            cad[py2, (px1 + 1) % hooks] = 255
                            cad[py2, px2] = 255
                            cad[py2, (px2 + 1) % hooks] = 255

                    if 0 <= y_base < picks:
                        corner_x = x_base % hooks
                        cv2.circle(cad, (corner_x, y_base), 4, 255, -1)
                        cv2.circle(cad, (corner_x, y_base), 1, 0, -1)

        # 3. Authentic Jacquard ground weave (1-pixel satin twill tie-downs)
        # Prevents long loose ground threads, matching real mill card punch files
        for y in range(picks):
            for x in range(hooks):
                if cad[y, x] == 0:
                    if (x + y * 2) % 6 == 0:
                        cad[y, x] = 255

        return cad

    @classmethod
    def build_border_draft(
        cls,
        hooks: int = 240,
        picks: int = 576,
        border_binary: Optional[np.ndarray] = None,
        kalgi_binary: Optional[np.ndarray] = None,
    ) -> np.ndarray:
        """Synthesize the isolated multi-tier Border CAD draft.

        Follows standard South Indian Kanchipuram and Banarasi border architecture:
          - Tier 1: Gopuram Temple Kalgi Spearheads (picks 0..75)
          - Tier 2: Muthu Pearl Beads & Zari Rope (picks 75..95)
          - Tier 3: Upper Kodi Visiri Floral Wave Vine (picks 95..180)
          - Tier 4: Veldhari Diamond Chevrons (picks 180..235)
          - Tier 5: Grand Central Zari Ribbon (picks 235..450, 215 picks tall!)
          - Tier 6: Lower Kodi Visiri Floral Wave Vine (picks 450..515)
          - Tier 7: Lower Veldhari Chevrons (picks 515..555)
          - Tier 8: Bottom Guard Band, Muthu Beads, and Selvage (picks 555..576)
        """
        cad = np.zeros((picks, hooks), dtype=np.uint8)

        # Scale tier boundary heights proportionally if picks != 576
        scale_y = picks / 576.0

        def sy(val: int) -> int:
            return min(picks - 1, max(0, int(val * scale_y)))

        # Tier 1: Temple Kalgi Chevrons
        cls.draw_temple_kalgi(cad, sy(0), sy(74), arch_w=40)

        # Tier 2: Muthu Beads & Zari Rope
        cls.draw_muthu_beads(cad, sy(78))
        cls.draw_rope(cad, sy(88), height=max(3, int(4 * scale_y)))

        # Tier 3: Upper Kodi Visiri Floral Creeper
        cls.draw_floral_creeper(cad, sy(96), sy(175), period=60)
        cls.draw_rope(cad, sy(178), height=max(2, int(3 * scale_y)))

        # Tier 4: Veldhari Diamond Chevrons
        cls.draw_veldhari(cad, sy(184), sy(230), dw=24)
        cls.draw_muthu_beads(cad, sy(234))

        # Tier 5: Grand Central Ribbon (215 picks tall!)
        g_y1 = sy(242)
        g_y2 = sy(448)
        grand_h = g_y2 - g_y1

        if grand_h >= 40:
            if border_binary is not None and border_binary.size > 0:
                # Integrate extracted authentic border seamlessly
                b_res = cv2.resize(border_binary, (hooks, grand_h), interpolation=cv2.INTER_NEAREST)
                cad[g_y1:g_y2, :] = b_res
            else:
                # Synthesize grand horizontal band of scrolling lotus & kalka medallions
                cls.draw_floral_creeper(cad, g_y1 + 10, g_y2 - 10, period=80)
                for a in range(hooks // 80):
                    bx = a * 80
                    cx = (bx + 40) % hooks
                    cy = g_y1 + grand_h // 2
                    # Grand lotus flower medallion
                    cv2.ellipse(cad, (cx, cy), (int(hooks * 0.12), int(grand_h * 0.38)), 0, 0, 360, 255, 3)
                    cv2.ellipse(cad, (cx, cy), (int(hooks * 0.08), int(grand_h * 0.22)), 0, 0, 360, 255, -1)
                    cv2.circle(cad, (cx, cy), 6, 0, -1)

        # Tier 6: Lower Kodi Visiri Floral Creeper
        cls.draw_muthu_beads(cad, sy(452))
        cls.draw_rope(cad, sy(460), height=max(2, int(3 * scale_y)))
        cls.draw_floral_creeper(cad, sy(466), sy(515), period=60)

        # Tier 7: Lower Veldhari Chevrons
        cls.draw_veldhari(cad, sy(518), sy(550), dw=20)

        # Tier 8: Bottom Guard Band, Muthu Beads, and Selvage
        cls.draw_muthu_beads(cad, sy(554))
        cls.draw_rope(cad, sy(562), height=max(3, int(4 * scale_y)))
        cad[sy(570):picks, :] = 255  # Solid selvage edge

        # Ensure 100% seamless horizontal repeat across hooks
        cad[:, 0] = cad[:, -1]
        return cad

    @classmethod
    def build_pallu_draft(
        cls,
        hooks: int = 240,
        picks: int = 1024,
        grand_kalka: Optional[np.ndarray] = None,
        butta_binary: Optional[np.ndarray] = None,
        kalgi_binary: Optional[np.ndarray] = None,
    ) -> np.ndarray:
        """Synthesize the isolated Pallu (Anchal/Mundhi) CAD draft.

        Ceremonial multi-tiered royal panel with:
          - Transition bands (picks 0..120)
          - Upper running figure band (picks 120..270)
          - Double floral creepers (picks 270..350)
          - Grand Centerpiece Medallion (picks 350..810, 460 picks tall!)
          - Symmetrical lower figure band (picks 810..940)
          - Fringed hem & selvage (picks 940..1024)
        """
        cad = np.zeros((picks, hooks), dtype=np.uint8)
        scale_y = picks / 1024.0

        def py(val: int) -> int:
            return min(picks - 1, max(0, int(val * scale_y)))

        # 1. Top Transition Bands
        cls.draw_temple_kalgi(cad, py(0), py(65), arch_w=40)
        cls.draw_muthu_beads(cad, py(68))
        cls.draw_rope(cad, py(76), height=max(3, int(4 * scale_y)))
        cls.draw_floral_creeper(cad, py(82), py(125), period=60)
        cls.draw_rope(cad, py(128), height=max(3, int(4 * scale_y)))

        # 2. Upper Running Figure Band (Peacocks / Mangoes)
        f_y1 = py(134)
        f_y2 = py(260)
        fh = f_y2 - f_y1
        num_figs = max(2, hooks // 60)
        fw = hooks // num_figs
        for i in range(num_figs):
            fx = i * fw + fw // 2
            fy = f_y1 + fh // 2
            # Stylized Mayil / Mango
            cv2.ellipse(cad, (fx, fy + 4), (fw // 3, fh // 3), 0, 0, 360, 255, 2)
            cv2.circle(cad, (fx, fy + 4), 6, 255, -1)
            # Crest plumage
            cv2.line(cad, (fx, fy - 6), (fx - 8, fy - fh // 3), 255, 2)
            cv2.line(cad, (fx, fy - 6), (fx, fy - fh // 3 - 4), 255, 2)
            cv2.line(cad, (fx, fy - 6), (fx + 8, fy - fh // 3), 255, 2)

        cls.draw_rope(cad, py(264), height=max(3, int(4 * scale_y)))
        cls.draw_veldhari(cad, py(270), py(315), dw=24)
        cls.draw_muthu_beads(cad, py(318))
        cls.draw_floral_creeper(cad, py(326), py(370), period=60)
        cls.draw_rope(cad, py(374), height=max(3, int(4 * scale_y)))

        # 3. Grand Royal Centerpiece Medallion Panel (picks 380..800, 420 picks tall!)
        m_y1 = py(380)
        m_y2 = py(800)
        mh = m_y2 - m_y1
        cx = hooks // 2
        cy = m_y1 + mh // 2

        if grand_kalka is not None and grand_kalka.size > 0:
            target_gw = min(hooks - 16, int(hooks * 0.90))
            target_gh = min(mh - 20, int(grand_kalka.shape[0] * (target_gw / max(1, grand_kalka.shape[1]))))
            medallion_res = cv2.resize(grand_kalka, (target_gw, target_gh), interpolation=cv2.INTER_NEAREST)
            gy_pos = cy - target_gh // 2
            gx_pos = (hooks - target_gw) // 2
            for dy in range(target_gh):
                for dx in range(target_gw):
                    if medallion_res[dy, dx] > 128:
                        cad[gy_pos + dy, gx_pos + dx] = 255
        else:
            # Grand Annapakshi & Royal Kalka Medallion with concentric filigree arches
            rad_x = int(hooks * 0.38)
            rad_y = int(mh * 0.40)
            cv2.ellipse(cad, (cx, cy), (rad_x, rad_y), 0, 0, 360, 255, 3)
            cv2.ellipse(cad, (cx, cy), (rad_x - 8, rad_y - 8), 0, 0, 360, 255, 2)
            cv2.ellipse(cad, (cx, cy), (int(rad_x * 0.65), int(rad_y * 0.65)), 0, 0, 360, 255, 2)
            cv2.ellipse(cad, (cx, cy), (int(rad_x * 0.40), int(rad_y * 0.40)), 0, 0, 360, 255, -1)
            cv2.circle(cad, (cx, cy), 8, 0, -1)

            # Radiating peacock feather rays
            for deg in range(0, 360, 15):
                rad = np.deg2rad(deg)
                x1 = int(cx + (rad_x - 6) * np.cos(rad))
                y1 = int(cy + (rad_y - 6) * np.sin(rad))
                x2 = int(cx + (rad_x + 12) * np.cos(rad))
                y2 = int(cy + (rad_y + 12) * np.sin(rad))
                cv2.line(cad, (x1, y1), (x2, y2), 255, 2)

            # 4 Corner Paisley Kalka Ornaments ('Kona Kalkas')
            for corner_x, corner_y, rot in [(24, m_y1 + 30, -35), (hooks - 24, m_y1 + 30, 35),
                                           (24, m_y2 - 30, -145), (hooks - 24, m_y2 - 30, 145)]:
                cv2.ellipse(cad, (corner_x, corner_y), (18, 28), rot, 0, 360, 255, 2)
                cv2.circle(cad, (corner_x, corner_y), 6, 255, -1)

        # 4. Lower Creepers & Running Figure Band
        cls.draw_rope(cad, py(806), height=max(3, int(4 * scale_y)))
        cls.draw_floral_creeper(cad, py(812), py(855), period=60)
        cls.draw_muthu_beads(cad, py(858))
        cls.draw_veldhari(cad, py(864), py(910), dw=24)
        cls.draw_rope(cad, py(914), height=max(3, int(4 * scale_y)))

        # 5. Fringed Hem & Selvage
        cls.draw_temple_kalgi(cad, py(920), py(985), arch_w=40)
        cls.draw_muthu_beads(cad, py(990))
        cls.draw_rope(cad, py(998), height=max(4, int(5 * scale_y)))
        cad[py(1008):picks, :] = 255

        # Seamless horizontal repeat
        cad[:, 0] = cad[:, -1]
        return cad

    # ──────────────────────────────────────────────────────────────────────────
    # 3. Dynamic Composite Saree Synthesis (Matching Saree's Real Layout)
    # ──────────────────────────────────────────────────────────────────────────

    @classmethod
    def synthesize_draft(
        cls,
        analysis: SareePatternAnalysis,
        extracted_butta: Optional[np.ndarray] = None,
        extracted_border: Optional[np.ndarray] = None,
        extracted_kalgi: Optional[np.ndarray] = None,
        extracted_kalka: Optional[np.ndarray] = None,
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """Synthesize the master Jacquard CAD draft and generate colorways.

        Dynamically adapts canvas dimensions and zone layouts to the detected
        saree architecture (all_over_brocade, single_border_and_body, double_border, etc.).
        """
        W = analysis.suggested_hooks if analysis.suggested_hooks in (180, 240, 360, 480) else cls.DEFAULT_HOOKS
        H = analysis.suggested_picks if analysis.suggested_picks in (480, 540, 1024, 1536) else cls.DEFAULT_PICKS
        layout = getattr(analysis, "layout_type", "single_border_and_body")

        cad = np.zeros((H, W), dtype=np.uint8)

        if layout == "all_over_brocade":
            # Pure repeating all-over brocade (like sample 480 broket)
            cad = cls.build_body_draft(
                hooks=W,
                picks=H,
                butta_binary=extracted_butta,
                repeat_arrangement=analysis.repeat_arrangement,
                layout_type=layout,
            )
        elif layout == "double_border":
            # Symmetrical Double Border (like sample 06: 420 top border + 696 body + 420 bottom border = 1536)
            top_h = int(H * 0.28)
            bot_h = int(H * 0.28)
            body_h = H - top_h - bot_h

            top_border = cls.build_border_draft(hooks=W, picks=top_h, border_binary=extracted_border, kalgi_binary=extracted_kalgi)
            bot_border = cv2.flip(top_border, 0)
            body = cls.build_body_draft(hooks=W, picks=body_h, butta_binary=extracted_butta, repeat_arrangement=analysis.repeat_arrangement, layout_type=layout)

            cad[:top_h, :] = top_border
            cad[top_h:top_h + body_h, :] = body
            cad[top_h + body_h:, :] = bot_border
        elif layout == "pallu_panel":
            # Grand Pallu Endpiece
            cad = cls.build_pallu_draft(
                hooks=W,
                picks=H,
                grand_kalka=extracted_kalka,
                butta_binary=extracted_butta,
                kalgi_binary=extracted_kalgi,
            )
        else:
            # Single Border and Body (like sample 05: bottom border 576 picks + top body 960 picks = 1536)
            border_h = 576 if H >= 1536 else int(H * 0.38)
            body_h = H - border_h

            body = cls.build_body_draft(hooks=W, picks=body_h, butta_binary=extracted_butta, repeat_arrangement=analysis.repeat_arrangement, layout_type=layout)
            border = cls.build_border_draft(hooks=W, picks=border_h, border_binary=extracted_border, kalgi_binary=extracted_kalgi)

            # Body occupies top picks, border occupies bottom picks
            cad[:body_h, :] = body
            cad[body_h:, :] = border

        # Ensure seamless horizontal repeat across hooks
        cad[:, 0] = cad[:, -1]

        # Generate the standard colorways
        hsv_g = cv2.cvtColor(np.uint8([[[int(c) for c in bytes.fromhex(analysis.detected_ground_hex.lstrip('#'))]]]), cv2.COLOR_RGB2BGR)[0, 0]
        hsv_z = cv2.cvtColor(np.uint8([[[int(c) for c in bytes.fromhex(analysis.detected_zari_hex.lstrip('#'))]]]), cv2.COLOR_RGB2BGR)[0, 0]
        ground_bgr = hsv_g
        zari_bgr = hsv_z

        auth_bgr, blue_bgr, red_bgr = cls.generate_colorways(cad, ground_bgr, zari_bgr)
        return cad, auth_bgr, blue_bgr, red_bgr

    # ──────────────────────────────────────────────────────────────────────────
    # 4. Colorway Generation (Authentic, Royal Blue, Crimson Red)
    # ──────────────────────────────────────────────────────────────────────────

    @classmethod
    def generate_colorways(
        cls,
        binary_draft: np.ndarray,
        ground_bgr: np.ndarray,
        zari_bgr: np.ndarray,
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Generate 3 visual CAD colorways: Authentic Saree, Royal Blue, and Crimson Red."""
        H, W = binary_draft.shape[:2]
        fg_mask = binary_draft > 128

        # 1. Authentic Saree Colors
        auth_bgr = np.zeros((H, W, 3), dtype=np.uint8)
        auth_bgr[~fg_mask] = ground_bgr
        auth_bgr[fg_mask] = zari_bgr

        # 2. Traditional Loom Blue & White (Royal Blue #0000FF, White #FFFFFF)
        blue_bgr = np.zeros((H, W, 3), dtype=np.uint8)
        blue_bgr[~fg_mask] = [255, 0, 0]  # BGR for pure blue
        blue_bgr[fg_mask] = [255, 255, 255]

        # 3. Traditional Loom Crimson Red & White (Red #C00000, White #FFFFFF)
        red_bgr = np.zeros((H, W, 3), dtype=np.uint8)
        red_bgr[~fg_mask] = [0, 0, 192]  # BGR for crimson red
        red_bgr[fg_mask] = [255, 255, 255]

        return auth_bgr, blue_bgr, red_bgr

    # ──────────────────────────────────────────────────────────────────────────
    # 5. Electronic Jacquard 1-Bit Weft Card Separations
    # ──────────────────────────────────────────────────────────────────────────

    @classmethod
    def generate_weft_separations(
        cls,
        binary_draft: np.ndarray,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """Produce exact 1-bit monochrome card punch separations for electronic Jacquard looms.

        Returns
        -------
        jeri_plane : np.ndarray (uint8, 0 or 255)
            Zari card plane with 1px twill tie-down float binders on motif face.
        ani_plane : np.ndarray (uint8, 0 or 255)
            Tabby Silk card plane with 1x1 checkerboard plain weave for base fabric.
        """
        H, W = binary_draft.shape[:2]

        # 1. Jeri Plane (Zari Extra-Weft Card Punch)
        jeri_plane = binary_draft.copy()
        # Inject authentic 1/4 twill tie-downs inside thick motif interiors (preventing loose floats)
        eroded = cv2.erode(jeri_plane, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)))
        interior = (jeri_plane > 128) & (eroded > 128)
        for y in range(H):
            for x in range(W):
                if interior[y, x] and (x + y * 2) % 4 == 0:
                    jeri_plane[y, x] = 0

        # 2. Ani Plane (Ground Silk Tabby Plain Weave Card Punch)
        ani_plane = np.zeros((H, W), dtype=np.uint8)
        for y in range(H):
            for x in range(W):
                # Standard 1x1 plain weave checkerboard for ground weft
                if (x + y) % 2 == 0:
                    ani_plane[y, x] = 255

        return jeri_plane, ani_plane
