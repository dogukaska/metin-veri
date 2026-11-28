importScripts("../vendor/papaparse.min.js?v=5.5.3", "../vendor/xlsx.core.min.js?v=0.20.3");

const FILE_LIMIT = 10 * 1024 * 1024;
const ARCHIVE_LIMIT = 64 * 1024 * 1024;
const CELL_LIMIT = 300_000;
const PREVIEW_ROWS = 8;
const PREVIEW_COLUMNS = 8;
const formulaText = /^[\p{White_Space}\p{Cf}]*[=+\-@＝＋－＠]|^[\r\n\t]/u;
const excelMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
let values = null;
let workbook = null;

function csvText(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(buffer);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(buffer);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch { return new TextDecoder("windows-1254").decode(buffer); }
}

function readCsv(buffer, delimiter) {
  const input = csvText(buffer);
  if (!input.trim() || input.includes("\0")) throw new Error("Okunabilir bir CSV dosyası seç.");
  // An empty record at the end can mask the separator in short two-column CSVs.
  const separator = delimiter === "auto" ? Papa.parse(input, {
    delimitersToGuess: [";", ",", "\t"], preview: 10, skipEmptyLines: true,
  }).meta.delimiter : delimiter;
  const result = Papa.parse(input, {
    delimiter: separator,
    dynamicTyping: false,
  });
  if (result.errors.some(error => error.type === "Quotes")) throw new Error("CSV’de kapanmamış veya hatalı tırnak var.");
  if (/[\r\n]$/.test(input) && result.data.at(-1)?.length === 1 && result.data.at(-1)[0] === "") result.data.pop();
  const dimensions = rowDimensions(result.data);
  ensureSize(dimensions.rows, dimensions.columns);
  if (result.data.some(row => row.some(cell => cell.length > 32_767))) {
    throw new Error("Bir hücre Excel’in 32.767 karakter sınırını aşıyor.");
  }
  return result.data;
}

function ensureSize(rows, columns) {
  if (columns > 16_384 || rows > 1_048_576 || rows * columns > CELL_LIMIT) {
    throw new Error("Bir sayfada en fazla 300.000 hücre işlenebilir.");
  }
}

function rowDimensions(rows) {
  return { rows: rows.length, columns: rows.reduce((max, row) => Math.max(max, row.length), 0) };
}

// Check ZIP members before handing the package to the workbook parser.
function validateArchive(buffer) {
  const view = new DataView(buffer);
  const u16 = offset => view.getUint16(offset, true);
  const u32 = offset => view.getUint32(offset, true);
  const invalid = () => new Error("Dosyayı XLSX biçiminde yeniden kaydedip dene.");
  if (buffer.byteLength < 22 || u32(0) !== 0x04034b50) throw invalid();
  const floor = Math.max(0, view.byteLength - 65_557);
  for (let end = view.byteLength - 22; end >= floor; end--) {
    if (u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== view.byteLength) continue;
    const entries = u16(end + 10);
    const offset = u32(end + 16);
    if (u16(end + 4) || u16(end + 6) || entries !== u16(end + 8) ||
        entries === 0 || entries > 4096 || offset + u32(end + 12) !== end) throw invalid();
    let cursor = offset;
    let bytes = 0;
    for (let index = 0; index < entries; index++) {
      if (cursor + 46 > end || u32(cursor) !== 0x02014b50 || u16(cursor + 8) & 1) throw invalid();
      bytes += u32(cursor + 24);
      if (bytes > ARCHIVE_LIMIT) throw new Error("Excel dosyasının açılmış içeriği 64 MiB sınırını aşıyor.");
      cursor += 46 + u16(cursor + 28) + u16(cursor + 30) + u16(cursor + 32);
    }
    if (cursor !== end) throw invalid();
    return;
  }
  throw invalid();
}

function workbookSheet(name) {
  const sheet = workbook?.Sheets[name];
  if (!sheet) throw new Error("Bir Excel sayfası seç.");
  if (!sheet["!ref"]) return { sheet, range: null, rows: 0, columns: 0 };
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const rows = range.e.r - range.s.r + 1;
  const columns = range.e.c - range.s.c + 1;
  if (range.s.r < 0 || range.s.c < 0 || rows < 1 || columns < 1 ||
      range.e.r >= 1_048_576 || range.e.c >= 16_384) throw new Error("Sayfanın hücre aralığı okunamadı.");
  ensureSize(rows, columns);
  return { sheet, range, rows, columns };
}

function cellValue(cell) {
  if (!cell || cell.t === "z" || cell.v == null) return "";
  const display = XLSX.utils.format_cell(cell);
  return cell.t === "n" && display === String(cell.v) ? cell.v : display;
}

function sheetValues({ sheet, range, rows, columns }, preview = false) {
  return Array.from({ length: preview ? Math.min(rows, PREVIEW_ROWS) : rows }, (_, r) =>
    Array.from({ length: preview ? Math.min(columns, PREVIEW_COLUMNS) : columns }, (_, c) => {
      const address = XLSX.utils.encode_cell({ r: range.s.r + r, c: range.s.c + c });
      return cellValue(sheet[address]);
    }));
}

function preview(name) {
  if (values) return { ...rowDimensions(values), cells: values.slice(0, PREVIEW_ROWS).map(row => row.slice(0, PREVIEW_COLUMNS)) };
  const selected = workbookSheet(name);
  return { rows: selected.rows, columns: selected.columns, cells: sheetValues(selected, true) };
}

function fileOutput(name, delimiter) {
  if (values) {
    const output = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(output, XLSX.utils.aoa_to_sheet(values), "Veri");
    const buffer = XLSX.write(output, { bookType: "xlsx", type: "array", compression: true });
    return new Blob([buffer], { type: excelMime });
  }
  const rows = sheetValues(workbookSheet(name));
  const csv = Papa.unparse(rows, { delimiter, escapeFormulae: formulaText });
  return new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
}

self.onmessage = async ({ data }) => {
  const { id, action, name, delimiter } = data;
  try {
    if (action === "open") {
      const { file, direction } = data;
      if (file.size > FILE_LIMIT) throw new Error("En fazla 10 MiB dosya seç.");
      const buffer = await file.arrayBuffer();
      if (direction === "csv-to-xlsx") {
        values = readCsv(buffer, delimiter);
        self.postMessage({ id, action, entries: [], preview: preview() });
      } else {
        validateArchive(buffer);
        try { workbook = XLSX.read(buffer, { type: "array", bookVBA: false }); }
        catch { throw new Error("Excel dosyası okunamadı."); }
        const entries = workbook.SheetNames;
        if (!entries.length) throw new Error("Dosyada Excel sayfası bulunamadı.");
        let first = null;
        try { first = preview(entries[0]); } catch (error) {
          self.postMessage({ id, action, entries, message: error.message });
          return;
        }
        self.postMessage({ id, action, entries, preview: first });
      }
    } else if (action === "preview") {
      self.postMessage({ id, action, preview: preview(name) });
    } else if (action === "export") {
      self.postMessage({ id, action, file: fileOutput(name, delimiter) });
    }
  } catch (error) {
    self.postMessage({ id, action, message: error?.message || "Dosya işlenemedi." });
  }
};
