#!/usr/bin/env python3
"""
Fluxo opcional (legado): a partir de `icon.source.png` ou `icon.png`, aplica margem
e cantos arredondados, depois regenere com `tauri icon`.

Fluxo padrão do projeto: ícone em `public/AppIcon1024.png` → `npm run tauri:icons`.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

SIZE = 1024
# ~8% de margem por lado → conteúdo ~84% (aparece um pouco menor no dock)
INSET_RATIO = 0.84
# Raio maior que um quadrado simples (~22% do lado ≈ ícones estilo Big Sur / squircle aproximado)
CORNER_RADIUS_RATIO = 0.224


def main() -> None:
    icons = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"
    source = icons / "icon.source.png"
    if not source.exists():
        source = icons / "icon.png"
    if not source.exists():
        raise SystemExit(f"Coloque icon.source.png ou icon.png em {icons}")

    base = Image.open(source).convert("RGBA")
    inner = int(SIZE * INSET_RATIO)
    base.thumbnail((inner, inner), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    x = (SIZE - base.width) // 2
    y = (SIZE - base.height) // 2
    canvas.paste(base, (x, y), base)

    r = max(8, round(SIZE * CORNER_RADIUS_RATIO))
    mask = Image.new("L", (SIZE, SIZE), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, SIZE, SIZE), radius=r, fill=255)

    alpha = canvas.split()[3]
    alpha = ImageChops.multiply(alpha, mask)
    canvas.putalpha(alpha)

    out = icons / "icon.png"
    canvas.save(out, format="PNG", optimize=True)
    print(f"Gerado: {out} a partir de {source.name} ({SIZE}x{SIZE}, inset≈{INSET_RATIO}, r≈{r}px)")


if __name__ == "__main__":
    main()
