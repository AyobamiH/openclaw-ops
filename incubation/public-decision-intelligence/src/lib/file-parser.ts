import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { PDFParse } from "pdf-parse";

export interface ParsedBlock {
  content: string;
  page: number | null;
}

export interface ParseResult {
  format: string;
  parseStatus: "complete" | "partial" | "failed";
  ocrStatus: "not_needed" | "not_configured" | "pending" | "complete" | "failed";
  warnings: string[];
  blocks: ParsedBlock[];
}

export function inferFormat(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".txt":
    case ".md":
    case ".markdown":
    case ".yaml":
    case ".yml":
      return "text";
    case ".json":
      return "json";
    case ".csv":
      return "csv";
    case ".html":
    case ".htm":
      return "html";
    case ".ipynb":
      return "ipynb";
    case ".pdf":
      return "pdf";
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".gif":
    case ".webp":
      return "image";
    case ".mp3":
    case ".wav":
    case ".m4a":
      return "audio";
    case ".mp4":
    case ".mov":
    case ".webm":
      return "video";
    default:
      return "text";
  }
}

export async function parseSourceFile(
  filePath: string,
  options: { ocrFallbackEnabled: boolean }
): Promise<ParseResult> {
  const format = inferFormat(filePath);
  const warnings: string[] = [];

  if (format === "image" || format === "audio" || format === "video") {
    const info = await stat(filePath);
    return {
      format,
      parseStatus: "partial",
      ocrStatus: "not_needed",
      warnings: [`Binary asset indexed as manifest-only metadata (${basename(filePath)}, ${info.size} bytes).`],
      blocks: [
        {
          content: `${format} asset ${basename(filePath)} is available as a source artifact; metadata indexed, content not transcribed.`,
          page: 1
        }
      ]
    };
  }

  if (format === "pdf") {
    try {
      const data = await readFile(filePath);
      const parser = new PDFParse({ data });
      const result = await parser.getText();
      await parser.destroy();

      const blocks = (result.pages ?? [])
        .map((page) => ({
          content: normalizePdfText(page.text ?? ""),
          page: page.num ?? null
        }))
        .filter((block) => block.content.length > 0);

      if (blocks.length === 0) {
        return {
          format,
          parseStatus: "partial",
          ocrStatus: options.ocrFallbackEnabled ? "not_configured" : "not_needed",
          warnings: [
            "PDF text extraction completed but did not yield readable page text.",
            options.ocrFallbackEnabled
              ? "OCR fallback requested but no OCR engine is configured."
              : "OCR fallback is disabled."
          ],
          blocks: [
            {
              content: `PDF source ${basename(filePath)} was ingested, but readable text could not be extracted from the current pages.`,
              page: 1
            }
          ]
        };
      }

      if (blocks.length < (result.total ?? blocks.length)) {
        warnings.push("Some PDF pages did not yield extractable text and were omitted from the page-block output.");
      }

      return {
        format,
        parseStatus: "complete",
        ocrStatus: "not_needed",
        warnings,
        blocks
      };
    } catch (error) {
      warnings.push(`PDF extraction failed: ${error instanceof Error ? error.message : "unknown parser error"}`);
      return {
        format,
        parseStatus: "partial",
        ocrStatus: options.ocrFallbackEnabled ? "not_configured" : "failed",
        warnings,
        blocks: [
          {
            content: `PDF source ${basename(filePath)} was ingested, but text extraction failed in the current runtime.`,
            page: 1
          }
        ]
      };
    }
  }

  const content = await readFile(filePath, "utf8");

  if (format === "json") {
    return {
      format,
      parseStatus: "complete",
      ocrStatus: "not_needed",
      warnings,
      blocks: [
        {
          content: JSON.stringify(JSON.parse(content), null, 2),
          page: 1
        }
      ]
    };
  }

  if (format === "csv") {
    return {
      format,
      parseStatus: "complete",
      ocrStatus: "not_needed",
      warnings,
      blocks: content
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line, index) => ({ content: line, page: index + 1 }))
    };
  }

  if (format === "html") {
    const paragraphs = [...content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => stripHtml(match[1]))
      .map((text) => text.trim())
      .filter(Boolean);
    const blocks = paragraphs.length > 0 ? paragraphs : [stripHtml(content).trim()].filter(Boolean);
    return {
      format,
      parseStatus: "complete",
      ocrStatus: "not_needed",
      warnings,
      blocks: blocks.map((block, index) => ({ content: block, page: index + 1 }))
    };
  }

  if (format === "ipynb") {
    const notebook = JSON.parse(content) as {
      cells?: Array<{ cell_type?: string; source?: string[] | string }>;
    };
    const blocks = (Array.isArray(notebook.cells) ? notebook.cells : []).map((cell, index) => {
      const source = Array.isArray(cell.source) ? cell.source.join("") : String(cell.source ?? "");
      return {
        content: `[${cell.cell_type ?? "unknown"} cell ${index}] ${source}`.trim(),
        page: index + 1
      };
    });
    return {
      format,
      parseStatus: "complete",
      ocrStatus: "not_needed",
      warnings,
      blocks
    };
  }

  const blocks = content
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => ({ content: block, page: index + 1 }));

  return {
    format,
    parseStatus: "complete",
    ocrStatus: "not_needed",
    warnings,
    blocks
  };
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePdfText(value: string): string {
  return value
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}
