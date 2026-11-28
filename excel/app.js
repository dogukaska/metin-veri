import { $, download, element } from "/gunluk/common.js?v=1";

const direction = $("direction");
const delimiter = $("delimiter");
const source = $("source-file");
const sheet = $("sheet");
const button = $("download");
const status = $("status");
const numbers = new Intl.NumberFormat("tr");
let file = null;
let worker = null;
let revision = 0;
let hasRows = false;

const importingCsv = () => direction.value === "csv-to-xlsx";

function setDirection() {
  source.value = "";
  source.accept = importingCsv()
    ? ".csv,.tsv,text/csv,text/tab-separated-values"
    : ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  $("file-label").textContent = importingCsv() ? "CSV dosyası seç" : "XLSX dosyası seç";
  $("delimiter-label").textContent = importingCsv() ? "Giriş ayıracı" : "Çıktı ayıracı";
  const options = [[";", "Noktalı virgül"], [",", "Virgül"], ["\t", "Sekme"]];
  if (importingCsv()) options.unshift(["auto", "Otomatik algıla"]);
  delimiter.replaceChildren(...options.map(([value, label]) => element("option", label, { value })));
  $("format-note").textContent = importingCsv()
    ? "CSV hücreleri metin olarak aktarılır. Barkod ve kodlardaki baştaki sıfırlar korunur."
    : "CSV dosyası UTF-8 olarak iner. Formül gibi görünen metinlere güvenli açılış için kesme işareti eklenir.";
  button.textContent = importingCsv() ? "Excel indir" : "CSV indir";
  file = null;
  open();
}

function setPreview(preview) {
  hasRows = Boolean(preview?.rows && preview?.columns);
  $("preview-section").hidden = !hasRows;
  button.disabled = !hasRows;
  const tbody = $("preview").tBodies[0];
  tbody.replaceChildren();
  if (!hasRows) return;
  const { cells, rows, columns } = preview;
  const visibleColumns = Math.min(columns, 8);
  for (const cellsInRow of cells) {
    const row = element("tr");
    for (let index = 0; index < visibleColumns; index++) {
      const value = String(cellsInRow[index] ?? "");
      row.append(element("td", value.length > 200 ? value.slice(0, 200) + "…" : value));
    }
    tbody.append(row);
  }
  const size = numbers.format(rows) + " satır · " + numbers.format(columns) + " sütun";
  const excerpt = rows > cells.length || columns > visibleColumns ? " · İlk satırlar ve sütunlar gösteriliyor" : "";
  $("preview-summary").textContent = size + excerpt;
}

function cleanName(value) {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim().replace(/\.+$/, "").slice(0, 90) || "tablo";
}

function outputName() {
  const base = cleanName(file.name.replace(/\.[^.]+$/, ""));
  return importingCsv() ? base + ".xlsx" : base + "-" + cleanName(sheet.value) + ".csv";
}

function open() {
  worker?.terminate();
  worker = null;
  revision++;
  setPreview(null);
  $("sheet-field").hidden = true;
  sheet.replaceChildren();
  status.textContent = "";
  if (!file) return;

  if (file.size === 0 || file.size > 10 * 1024 * 1024) {
    status.textContent = "Boş olmayan, en fazla 10 MiB boyutunda bir dosya seç.";
    return;
  }
  status.textContent = "Dosya okunuyor…";
  try {
    worker = new Worker(new URL("./worker.js?v=1", import.meta.url));
  } catch {
    status.textContent = "Dönüştürücü başlatılamadı.";
    return;
  }
  const current = worker;
  current.onmessage = ({ data }) => {
    if (worker !== current || data.id !== revision) return;
    if (data.entries?.length) {
      sheet.replaceChildren(...data.entries.map(name => element("option", name, { value: name })));
      $("sheet-field").hidden = false;
    }
    if (data.action === "export") {
      sheet.disabled = delimiter.disabled = false;
      button.disabled = !hasRows;
      if (data.file) {
        download(data.file, outputName());
        status.textContent = "Dosya hazır.";
      } else status.textContent = data.message;
      return;
    }
    setPreview(data.preview);
    status.textContent = data.message || (hasRows ? "Dosya dönüştürmeye hazır." : "Seçilen sayfada veri bulunamadı.");
  };
  current.onerror = event => {
    event.preventDefault();
    if (worker !== current) return;
    current.terminate();
    worker = null;
    sheet.disabled = delimiter.disabled = false;
    setPreview(null);
    status.textContent = "Dönüştürücü çalıştırılamadı. Dosyayı tekrar seç.";
  };
  current.postMessage({ id: revision, action: "open", file, direction: direction.value, delimiter: delimiter.value });
}

source.addEventListener("change", () => {
  sheet.disabled = delimiter.disabled = false;
  file = source.files[0] ?? null;
  open();
});
direction.addEventListener("change", () => {
  sheet.disabled = delimiter.disabled = false;
  setDirection();
});
delimiter.addEventListener("change", () => {
  if (importingCsv()) open();
});
sheet.addEventListener("change", () => {
  if (!worker) return;
  setPreview(null);
  status.textContent = "Sayfa okunuyor…";
  worker.postMessage({ id: ++revision, action: "preview", name: sheet.value });
});
button.addEventListener("click", () => {
  if (!worker || !hasRows) return;
  button.disabled = sheet.disabled = delimiter.disabled = true;
  status.textContent = "Dosya hazırlanıyor…";
  worker.postMessage({ id: ++revision, action: "export", name: sheet.value, delimiter: delimiter.value });
});

setDirection();
