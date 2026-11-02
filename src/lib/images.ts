// Reduce fotos de progreso antes de guardarlas. Una foto de celular (3–5 MB) queda en ~200–400 KB:
// ocupa menos cuota de IndexedDB y los respaldos JSON siguen siendo importables en el celular.
export async function downscaleImage(file: Blob, maxSide = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    // Si el resultado no mejora (foto ya chica), se conserva la original.
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
