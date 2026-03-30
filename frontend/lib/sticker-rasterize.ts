import type { StickerCaptionDrag } from "@/components/platform/sticker-compose-preview";

function wrapParagraph(
  ctx: CanvasRenderingContext2D,
  paragraph: string,
  maxW: number,
): string[] {
  const words = paragraph.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const tryLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(tryLine).width <= maxW) {
      line = tryLine;
    } else {
      if (line) out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out;
}

/**
 * Gera PNG com a legenda desenhada nas coordenadas (%, %) sobre a imagem.
 */
export async function rasterizeStickerWithCaption(
  imageFile: File,
  meta: StickerCaptionDrag,
): Promise<File> {
  const text = meta.text.trim();
  if (!text) return imageFile;

  const bitmap = await createImageBitmap(imageFile);
  const w = bitmap.width;
  const h = bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas não suportado");
  }

  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const cx = (meta.xPercent / 100) * w;
  const cy = (meta.yPercent / 100) * h;
  const fontSize = Math.max(12, Math.round(Math.min(w, h) * 0.055));
  const maxLineWidth = w * 0.88;
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const paragraphs = text.split(/\r?\n/);
  const finalLines: string[] = [];
  for (const p of paragraphs) {
    const wrapped = wrapParagraph(ctx, p, maxLineWidth);
    finalLines.push(...wrapped);
  }
  if (finalLines.length === 0) finalLines.push(text);

  const lineHeight = fontSize * 1.25;
  const totalH = finalLines.length * lineHeight;
  let y = cy - totalH / 2 + lineHeight / 2;

  for (const ln of finalLines) {
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.lineWidth = Math.max(2, fontSize * 0.12);
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeText(ln, cx, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(ln, cx, y);
    y += lineHeight;
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png");
  });
  const stem = imageFile.name.replace(/\.[^.]+$/, "") || "sticker";
  return new File([blob], `${stem}-legenda.png`, { type: "image/png" });
}
