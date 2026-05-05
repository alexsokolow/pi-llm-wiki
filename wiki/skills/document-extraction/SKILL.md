---
name: document-extraction
description: Extract text from PDF, DOCX, PPTX, images, spreadsheets using document_parse tool
---

# Document Extraction

Use `document_parse` to extract text from uploaded source files in `wiki/raw/`.

## When to use

- PDF, DOCX, PPTX, images, spreadsheets → use `document_parse`
- Plain text files (.md, .txt, .csv) → just use `read` directly, no parsing needed

## Usage

```
document_parse({ path: "wiki/raw/filename.pdf" })
```

## Options

- `ocr: "auto"` — enable OCR for scanned/image-based documents
- `ocrLanguage: "eng"` — ISO 639-3 language code for OCR
- `targetPages: "1-5"` — limit parsing to specific page range (PDF only)
- `format: "text"` — plain text output (default, preferred)
- `format: "json"` — structured output with bounding boxes (only when layout matters)

## Output

Returns extracted text content. For large documents, the output may be saved to a temporary file — use `read` on the returned path to access it.

## Tips

- Always use `format: "text"` unless you specifically need coordinates
- For very large documents (100+ pages), use `targetPages` to process in chunks
- The font warning "fetchStandardFontData: failed to fetch file" is harmless — text extraction still works
