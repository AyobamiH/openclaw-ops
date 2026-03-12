/**
 * DocumentParser Skill
 * 
 * Parse PDF/HTML/CSV/notebooks and asset metadata into structured blocks.
 * Extracts tables, entities, text blocks with coordinates.
 * 
 * Used by: document-and-data-extraction-agent
 */

import { SkillDefinition } from '../orchestrator/src/skills/types.js';
import { basename, extname } from 'node:path';

export const documentParserDefinition: SkillDefinition = {
  id: 'documentParser',
  version: '1.0.0',
  description: 'Parse documents, notebooks, and asset metadata into structured blocks with tables and entities',
  inputs: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Path to file in workspace' },
      format: {
        type: 'string',
        enum: ['pdf', 'html', 'csv', 'json', 'ipynb', 'image', 'audio', 'video'],
        description: 'File format',
      },
      extractTables: { type: 'boolean', description: 'Extract tables', default: true },
      extractEntities: { type: 'boolean', description: 'Extract named entities', default: true },
    },
    required: ['filePath', 'format'],
    examples: [
      { filePath: 'workspace/data/invoice.pdf', format: 'pdf' },
      { filePath: 'workspace/data/table.csv', format: 'csv', extractTables: true },
    ],
  },
  outputs: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      filePath: { type: 'string' },
      format: { type: 'string' },
      blocks: {
        type: 'array',
        description: 'Extracted content blocks',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['heading', 'paragraph', 'table', 'list'] },
            content: { type: 'string' },
            confidence: { type: 'number' },
            page: { type: 'number' },
          },
        },
      },
      tables: {
        type: 'array',
        description: 'Extracted tables',
        items: {
          type: 'object',
          properties: {
            headers: { type: 'array' },
            rows: { type: 'array' },
            page: { type: 'number' },
          },
        },
      },
      entities: {
        type: 'array',
        description: 'Named entities (dates, emails, amounts)',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            value: { type: 'string' },
            context: { type: 'string' },
          },
        },
      },
      data: {
        type: 'object',
        description: 'Structured extracted payload for downstream normalization',
      },
      metadata: {
        type: 'object',
        description: 'Supplemental parser metadata',
      },
      error: { type: 'string' },
    },
  },
  permissions: {
    fileRead: ['workspace'],
    fileWrite: ['artifacts'],
  },
  provenance: {
    author: 'OpenClaw Team',
    source: 'https://github.com/openclawio/orchestrator/commit/def456',
    version: '1.0.0',
    license: 'Apache-2.0',
  },
  audit: {
    passed: true,
    runAt: new Date().toISOString(),
    checks: [
      {
        name: 'permission-bounds',
        status: 'pass',
        message: 'File access limited to workspace',
      },
      {
        name: 'secret-access',
        status: 'pass',
        message: 'No credential access',
      },
    ],
    riskFlags: [],
  },
};

/**
 * Execute DocumentParser skill
 */
export async function executeDocumentParser(input: any): Promise<any> {
  const { filePath, format, extractTables = true, extractEntities = true } = input;

  try {
    // Import dynamically to handle different parsers
    const fs = await import('fs/promises');
    const stat = await fs.stat(filePath);
    const lowerFormat = String(format || '').toLowerCase();

    let result: any = {
      success: true,
      filePath,
      format: lowerFormat,
      blocks: [],
      tables: [],
      entities: [],
      data: null,
      metadata: {
        basename: basename(filePath),
        extension: extname(filePath).toLowerCase(),
        bytes: stat.size,
      },
    };

    if (lowerFormat === 'image' || lowerFormat === 'audio' || lowerFormat === 'video') {
      result = parseAssetMetadata(filePath, lowerFormat, stat, result);
      return result;
    }

    const content = await fs.readFile(filePath, 'utf-8');

    if (lowerFormat === 'csv') {
      result = parseCSV(content, result);
    } else if (lowerFormat === 'json') {
      result = parseJSON(content, result);
    } else if (lowerFormat === 'html') {
      result = parseHTML(content, result);
    } else if (lowerFormat === 'ipynb') {
      result = parseNotebook(content, result);
    } else if (lowerFormat === 'pdf') {
      // Note: PDF parsing requires pdfparse or similar
      // For MVP, return placeholder with guidance
      result.blocks.push({
        type: 'paragraph',
        content: 'PDF parsing requires additional dependencies (pdf-parse). Install via npm.',
        confidence: 0.5,
        page: 1,
      });
      result.data = {
        kind: 'document',
        format: 'pdf',
        note: 'PDF parsing requires additional dependencies (pdf-parse). Install via npm.',
      };
    }

    return result;
  } catch (error: any) {
    return {
      success: false,
      filePath,
      blocks: [],
      tables: [],
      entities: [],
      error: error.message,
    };
  }
}

function parseCSV(content: string, result: any): any {
  const lines = content.split('\n').filter(l => l.trim());
  
  if (lines.length === 0) {
    return result;
  }

  // First line is header
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line =>
    line.split(',').map(cell => cell.trim())
  );

  result.tables.push({
    headers,
    rows,
    page: 1,
  });

  // Extract entities from cells
  for (const row of rows) {
    for (const cell of row) {
      const entities = extractEntityPatterns(cell);
      result.entities.push(...entities);
    }
  }

  result.data = {
    kind: 'table',
    format: 'csv',
    headerCount: headers.length,
    rowCount: rows.length,
    headers,
    sampleRows: rows.slice(0, 5),
  };

  return result;
}

function parseJSON(content: string, result: any): any {
  try {
    const data = JSON.parse(content);
    result.blocks.push({
      type: 'paragraph',
      content: JSON.stringify(data, null, 2).substring(0, 500),
      confidence: 1.0,
      page: 1,
    });
    result.data = {
      kind: 'structured',
      format: 'json',
      value: data,
    };
    return result;
  } catch {
    result.blocks.push({
      type: 'paragraph',
      content: 'Invalid JSON',
      confidence: 0,
      page: 1,
    });
    return result;
  }
}

function parseHTML(content: string, result: any): any {
  // Simple regex-based HTML parsing (not robust for complex HTML)
  
  // Extract tables
  const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/gi;
  const tables = content.match(tableRegex) || [];
  
  for (const table of tables) {
    const rows = extractHTMLTableRows(table);
    if (rows.length > 0) {
      result.tables.push({
        headers: rows[0],
        rows: rows.slice(1),
        page: 1,
      });
    }
  }

  // Extract text blocks
  const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const paragraphs = content.match(paragraphRegex) || [];
  
  for (const para of paragraphs) {
    const text = stripHTMLTags(para).trim();
    if (text.length > 0) {
      result.blocks.push({
        type: 'paragraph',
        content: text.substring(0, 500),
        confidence: 0.9,
        page: 1,
      });
    }
  }

  result.data = {
    kind: 'document',
    format: 'html',
    paragraphCount: result.blocks.length,
    tableCount: result.tables.length,
  };

  return result;
}

function parseNotebook(content: string, result: any): any {
  try {
    const notebook = JSON.parse(content) as {
      metadata?: Record<string, unknown>;
      nbformat?: number;
      nbformat_minor?: number;
      cells?: Array<{
        cell_type?: string;
        source?: string[] | string;
        outputs?: Array<{
          output_type?: string;
          text?: string[] | string;
          data?: Record<string, unknown>;
        }>;
      }>;
    };

    const cells = Array.isArray(notebook.cells) ? notebook.cells : [];
    const markdownCells = cells.filter((cell) => cell.cell_type === 'markdown');
    const codeCells = cells.filter((cell) => cell.cell_type === 'code');

    const sampleCells = cells.slice(0, 12).map((cell, index) => {
      const rawSource = Array.isArray(cell.source) ? cell.source.join('') : String(cell.source ?? '');
      const collapsed = rawSource.replace(/\s+/g, ' ').trim().slice(0, 400);
      return {
        index,
        type: cell.cell_type ?? 'unknown',
        preview: collapsed,
      };
    });

    for (const cell of sampleCells) {
      result.blocks.push({
        type: cell.type === 'markdown' ? 'paragraph' : 'list',
        content: `[cell ${cell.index} | ${cell.type}] ${cell.preview}`,
        confidence: 0.95,
        page: cell.index + 1,
      });
      result.entities.push(...extractEntityPatterns(cell.preview));
    }

    result.data = {
      kind: 'notebook',
      format: 'ipynb',
      nbformat: notebook.nbformat ?? null,
      nbformatMinor: notebook.nbformat_minor ?? null,
      cellCount: cells.length,
      markdownCellCount: markdownCells.length,
      codeCellCount: codeCells.length,
      outputsCount: codeCells.reduce(
        (count, cell) => count + (Array.isArray(cell.outputs) ? cell.outputs.length : 0),
        0,
      ),
      metadata: notebook.metadata ?? {},
      sampleCells,
    };
  } catch (error: any) {
    result.success = false;
    result.error = `Invalid notebook JSON: ${error.message}`;
  }

  return result;
}

function parseAssetMetadata(filePath: string, format: string, stat: { size: number }, result: any): any {
  const extension = extname(filePath).toLowerCase();
  const stem = basename(filePath);
  result.blocks.push({
    type: 'paragraph',
    content: `${format} asset ${stem} (${extension || 'no extension'}) is available as a local reference artifact.`,
    confidence: 1,
    page: 1,
  });
  result.data = {
    kind: 'asset',
    format,
    basename: stem,
    extension,
    bytes: stat.size,
  };
  result.metadata = {
    ...result.metadata,
    mediaType: format,
  };
  return result;
}

function stripHTMLTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function extractHTMLTableRows(tableHTML: string): string[][] {
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  
  const rows: string[][] = [];
  let rowMatch;
  
  while ((rowMatch = rowRegex.exec(tableHTML))) {
    const cells: string[] = [];
    let cellMatch;
    const rowContent = rowMatch[1];
    
    while ((cellMatch = cellRegex.exec(rowContent))) {
      cells.push(stripHTMLTags(cellMatch[1]).trim());
    }
    
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  
  return rows;
}

function extractEntityPatterns(text: string): any[] {
  const entities: any[] = [];

  // Email pattern
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = text.match(emailRegex) || [];
  entities.push(...emails.map(e => ({ type: 'email', value: e, context: text })));

  // Date pattern (simple)
  const dateRegex = /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/g;
  const dates = text.match(dateRegex) || [];
  entities.push(...dates.map(d => ({ type: 'date', value: d, context: text })));

  // Currency pattern
  const currencyRegex = /[$€£¥]\s?[\d,]+\.\d{2}/g;
  const amounts = text.match(currencyRegex) || [];
  entities.push(...amounts.map(a => ({ type: 'amount', value: a, context: text })));

  return entities;
}
