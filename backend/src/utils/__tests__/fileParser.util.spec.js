import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import moduleLib from 'module';

const mockPdfParse = jest.fn().mockImplementation(async (buffer) => {
  if (buffer.toString() === 'error') {
    throw new Error('PDF mock error');
  }
  return { text: 'Extracted PDF Content' };
});

const mockMammoth = {
  extractRawText: jest.fn().mockImplementation(async ({ buffer }) => {
    if (buffer.toString() === 'error') {
      throw new Error('Mammoth mock error');
    }
    return { value: 'Extracted Word Content' };
  })
};

const mockExcelJS = {
  Workbook: jest.fn().mockImplementation(() => {
    return {
      xlsx: {
        load: jest.fn().mockImplementation(async (buffer) => {
          if (buffer.toString() === 'error') {
            throw new Error('Excel mock error');
          }
        })
      },
      eachSheet: jest.fn().mockImplementation((callback) => {
        const mockSheet = {
          name: 'Sheet1',
          eachRow: jest.fn().mockImplementation((rowCallback) => {
            rowCallback({ values: [null, 'Val1', 'Val2'] }, 1);
          })
        };
        callback(mockSheet);
      })
    };
  })
};

const mockPapa = {
  parse: jest.fn().mockImplementation((csvStr) => {
    if (csvStr === 'error') {
      throw new Error('CSV mock error');
    }
    return {
      data: [['Col1', 'Col2'], ['Row1Col1', 'Row1Col2']],
      errors: []
    };
  })
};

// Spy on moduleLib.createRequire and return our custom mock require
const actualCreateRequire = moduleLib.createRequire;
jest.spyOn(moduleLib, 'createRequire').mockImplementation((metaUrl) => {
  return (id) => {
    if (id === 'pdf-parse') return mockPdfParse;
    if (id === 'mammoth') return mockMammoth;
    if (id === 'exceljs') return mockExcelJS;
    if (id === 'papaparse') return mockPapa;
    return actualCreateRequire(metaUrl)(id);
  };
});

let extractTextFromBuffer;

describe('fileParser.util', () => {
  beforeAll(async () => {
    const mod = await import('../fileParser.util.js');
    extractTextFromBuffer = mod.extractTextFromBuffer;
  });

  it('should parse plain text files directly', async () => {
    const buffer = Buffer.from('Hello Plain Text');
    const result = await extractTextFromBuffer(buffer, 'test.txt', 'text/plain');
    expect(result).toBe('Hello Plain Text');
  });

  it('should parse PDF files using pdf-parse', async () => {
    const buffer = Buffer.from('PDF_BYTES');
    const result = await extractTextFromBuffer(buffer, 'test.pdf', 'application/pdf');
    expect(result).toBe('Extracted PDF Content');
  });

  it('should handle PDF parsing errors', async () => {
    const buffer = Buffer.from('error');
    await expect(extractTextFromBuffer(buffer, 'test.pdf', 'application/pdf'))
      .rejects.toThrow('Không thể giải nén file PDF');
  });

  it('should parse Word files (.docx) using mammoth', async () => {
    const buffer = Buffer.from('DOCX_BYTES');
    const result = await extractTextFromBuffer(buffer, 'test.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(result).toBe('Extracted Word Content');
  });

  it('should handle Word parsing errors', async () => {
    const buffer = Buffer.from('error');
    await expect(extractTextFromBuffer(buffer, 'test.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
      .rejects.toThrow('Không thể giải nén file Word');
  });

  it('should parse Excel files (.xlsx) using exceljs', async () => {
    const buffer = Buffer.from('XLSX_BYTES');
    const result = await extractTextFromBuffer(buffer, 'test.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(result).toContain('--- Sheet: Sheet1 ---');
    expect(result).toContain('Row 1: Val1 | Val2');
  });

  it('should handle Excel parsing errors', async () => {
    const buffer = Buffer.from('error');
    await expect(extractTextFromBuffer(buffer, 'test.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
      .rejects.toThrow('Không thể giải nén file Excel');
  });

  it('should parse CSV files using papaparse', async () => {
    const buffer = Buffer.from('Col1,Col2\nRow1Col1,Row1Col2');
    const result = await extractTextFromBuffer(buffer, 'test.csv', 'text/csv');
    expect(result).toContain('Col1 | Col2');
    expect(result).toContain('Row1Col1 | Row1Col2');
  });

  it('should handle CSV parsing errors', async () => {
    const buffer = Buffer.from('error');
    await expect(extractTextFromBuffer(buffer, 'test.csv', 'text/csv'))
      .rejects.toThrow('Không thể giải nén file CSV');
  });
});
