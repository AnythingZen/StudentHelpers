"""OCR a scanned PDF. Usage: python ocr.py <file.pdf> [page,page,...]
Prints {"pages": ["...text per page..."]}. Pages not listed come back as "".
Called by llm.ts only for pages whose text layer is empty."""

import json
import sys

import pypdfium2 as pdfium
from rapidocr_onnxruntime import RapidOCR

path = sys.argv[1]
wanted = {int(p) for p in sys.argv[2].split(",")} if len(sys.argv) > 2 else None
ocr = RapidOCR()
pdf = pdfium.PdfDocument(path)
pages = []
for i in range(len(pdf)):
    if wanted is not None and (i + 1) not in wanted:
        pages.append("")
        continue
    img = pdf[i].render(scale=2).to_pil()
    result, _ = ocr(img)
    # result: [[box, text, score], ...] in reading order; keep lines as lines
    pages.append("\n".join(r[1] for r in (result or [])))
print(json.dumps({"pages": pages}))
