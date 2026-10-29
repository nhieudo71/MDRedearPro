const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('os');
const { spawn } = require('child_process');
const { randomUUID } = require('node:crypto');

const mammoth = require('mammoth');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');

function createTurndown() {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  td.use(gfm);
  // Ảnh bị bỏ src (DOCX) hoặc data URI quá lớn → bỏ để Markdown gọn
  td.addRule('dropEmptyImg', {
    filter: (n) => n.nodeName === 'IMG' && !(n.getAttribute('src') || '').trim(),
    replacement: () => ''
  });
  return td;
}

const MD_EXT_RE = /\.(md|markdown|txt)$/i;
const findMdArg = (argv) => argv.slice(1).find(a => MD_EXT_RE.test(a));

let pdfjsLib = null;
async function getPdfjs() {
  // Bản legacy dành cho Node/Electron main process (bản thường in cảnh báo)
  if (!pdfjsLib) pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsLib;
}

function openExternalFile(filePath) {
  if (!mainWin) return;
  const send = () => mainWin.webContents.send('md-file-open-external', filePath);
  if (mainWin.webContents.isLoading()) mainWin.webContents.once('did-finish-load', send);
  else send();
}

let mainWin = null;
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  // Kích thước cửa sổ theo vùng làm việc của màn hình (trừ thanh taskbar)
  const { width: waW, height: waH } = screen.getPrimaryDisplay().workAreaSize;
  mainWin = new BrowserWindow({
    width: waW,
    height: waH,
    minWidth: Math.min(800, waW),
    minHeight: Math.min(600, waH),
    title: 'MD Reader Pro',
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev
    },
    show: false
  });

  mainWin.loadFile(path.join(__dirname, 'index.html'));
  mainWin.once('ready-to-show', () => { mainWin.maximize(); mainWin.show(); });
  if (isDev) { mainWin.webContents.openDevTools(); }
  return mainWin;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv, workingDirectory) => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
      const filePath = findMdArg(argv);
      if (filePath) openExternalFile(filePath);
    }
  });

  app.whenReady().then(() => {
    createWindow();
    const filePath = findMdArg(process.argv);
    if (filePath) openExternalFile(filePath);
  });
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ═══════════════════════════════════════════════════════════════════
// IPC: FILE READ / WRITE / SAVE AS
// ════════════════════════════════════════════════════════════════════
ipcMain.handle('md-fs-read', async (event, filePath) => {
  const content = await fs.readFile(filePath, 'utf8');
  return { path: filePath, name: path.basename(filePath), content };
});

ipcMain.handle('md-fs-write', async (event, { filePath, content }) => {
  await fs.writeFile(filePath, content, 'utf8');
  return { path: filePath, name: path.basename(filePath) };
});

ipcMain.handle('md-fs-save-as', async (event, { content, defaultName }) => {
  const result = await dialog.showSaveDialog(mainWin, {
    defaultPath: defaultName,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }, { name: 'Text', extensions: ['txt'] }]
  });
  if (result.canceled) return null;
  await fs.writeFile(result.filePath, content, 'utf8');
  return { path: result.filePath, name: path.basename(result.filePath) };
});

// Lưu dữ liệu nhị phân (WAV từ TTS) qua hộp thoại Save As
ipcMain.handle('md-fs-save-binary', async (event, { data, defaultName }) => {
  const result = await dialog.showSaveDialog(mainWin, {
    defaultPath: defaultName,
    filters: [{ name: 'WAV audio', extensions: ['wav'] }]
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, Buffer.from(data));
  return { filePath: result.filePath };
});

ipcMain.handle('md-fs-open-dialog', async (event) => {
  const result = await dialog.showOpenDialog(mainWin, {
    multiSelections: false,
    filters: [{ name: 'Markdown / Text', extensions: ['md', 'markdown', 'txt'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf8');
  return { path: filePath, name: path.basename(filePath), content };
});

// Hộp thoại chọn file để nhập (gồm cả định dạng cần chuyển đổi), chỉ trả đường dẫn
ipcMain.handle('md-fs-import-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWin, {
    properties: ['openFile'],
    filters: [
      { name: 'Tài liệu', extensions: ['md', 'markdown', 'txt', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'pdf', 'html', 'htm', 'png', 'jpg', 'jpeg', 'bmp', 'webp', 'tif', 'tiff'] },
      { name: 'Tất cả', extensions: ['*'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  return { path: filePath, name: path.basename(filePath) };
});

// ════════════════════════════════════════════════════════════════════
// IPC: CONVERT DOCX / XLSX / PDF / HTML → MARKDOWN (chạy main process)
// ════════════════════════════════════════════════════════════════════
// Người dùng hay gõ sẵn cú pháp Markdown (**đậm**, "1.", "-") trong Word; turndown escape chúng
// thành \*\*, 1\., \- nên không hiển thị đúng. Bỏ escape cho các mẫu này (giữ nguyên \[ \]).
function unescapeTypedMarkdown(md) {
  return md
    .replace(/\\\*\\\*/g, '**')
    .replace(/^(\s*)\\([-+*]) /gm, '$1$2 ')
    .replace(/^(\s*\d+)\\\. /gm, '$1. ');
}

ipcMain.handle('md-convert-docx', async (event, filePath) => {
  const result = await mammoth.convertToHtml(
    { path: filePath },
    { convertImage: mammoth.images.imgElement(async () => ({ src: '' })) }
  );
  return { markdown: unescapeTypedMarkdown(createTurndown().turndown(result.value)).trim(), messages: result.messages || [] };
});

const XLSX_MAX_ROWS = 200;
const mdCell = (v) => String(v ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();

ipcMain.handle('md-convert-xlsx', async (event, filePath) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath); // chỉ hỗ trợ .xlsx (không hỗ trợ .xls cũ)
  let md = '';
  for (const sheet of workbook.worksheets) {
    md += `# ${sheet.name}\n\n`;
    const cols = sheet.actualColumnCount || sheet.columnCount;
    const total = sheet.actualRowCount || sheet.rowCount;
    if (!cols || !total) { md += '*(Sheet trống)*\n\n'; continue; }
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (rows.length >= XLSX_MAX_ROWS) return;
      const cells = [];
      for (let c = 1; c <= cols; c++) cells.push(mdCell(row.getCell(c).text));
      rows.push(cells);
    });
    const [header, ...body] = rows;
    md += `| ${header.join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |\n`;
    for (const r of body) md += `| ${r.join(' | ')} |\n`;
    if (total > XLSX_MAX_ROWS) {
      md += `\n*... (${total - XLSX_MAX_ROWS} dòng bị cắt để giới hạn kích thước) ...*\n`;
    }
    md += '\n';
  }
  return { markdown: md.trim() };
});

// ── OCR (PaddleOCR) chạy bằng Python trong venv riêng ────────────────
const OCR_SCRIPT = path.join(__dirname, 'ocr_paddle.py')
  .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

function ocrPythonCmd() {
  if (process.env.MDR_OCR_PYTHON) return process.env.MDR_OCR_PYTHON;
  const p = path.join(process.env.LOCALAPPDATA || '', 'MDReaderPro', 'ocr-venv', 'Scripts', 'python.exe');
  return require('node:fs').existsSync(p) ? p : null;
}

function runOcr(args) {
  return new Promise((resolve, reject) => {
    const py = ocrPythonCmd();
    if (!py) return reject(new Error('Chưa cài PaddleOCR (thiếu %LOCALAPPDATA%\\MDReaderPro\\ocr-venv). Xem README.'));
    const proc = spawn(py, [OCR_SCRIPT, ...args], { windowsHide: true });
    let out = '';
    let err = '';
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', (c) => { out += c; });
    proc.stderr.on('data', (c) => { err = (err + c).slice(-1500); });
    proc.on('error', (e) => reject(new Error(`Không chạy được Python OCR: ${e.message}`)));
    proc.on('close', (code) => {
      const line = out.trim().split('\n').filter(Boolean).pop();
      let msg = null;
      try { msg = JSON.parse(line); } catch { /* bỏ qua */ }
      if (msg && msg.ok) return resolve(msg.pages || []);
      reject(new Error((msg && msg.error) || err.trim().slice(-400) || `OCR dừng (mã ${code})`));
    });
  });
}

// ── OCR chính: tesseract.js (model vie đi kèm trong tessdata/), đọc đúng dấu tiếng Việt ──
const TESSDATA_DIR = path.join(__dirname, 'tessdata')
  .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

let tessWorkerPromise = null;
function getTessWorker() {
  if (!tessWorkerPromise) {
    const { createWorker } = require('tesseract.js');
    tessWorkerPromise = createWorker('vie', 1, {
      langPath: TESSDATA_DIR,
      gzip: false,
      cachePath: path.join(os.tmpdir(), 'mdr-tess-cache')
    }).catch((e) => { tessWorkerPromise = null; throw e; });
  }
  return tessWorkerPromise;
}

async function tessRecognize(input) {
  const worker = await getTessWorker();
  const { data } = await worker.recognize(input);
  return (data.text || '').trim();
}

app.on('will-quit', () => {
  if (tessWorkerPromise) tessWorkerPromise.then((w) => w.terminate()).catch(() => {});
});

// Vẽ trang PDF thành PNG (pdfjs + @napi-rs/canvas) rồi OCR
async function tessOcrPdfPage(doc, n) {
  const { createCanvas } = require('@napi-rs/canvas');
  const page = await doc.getPage(n);
  const viewport = page.getViewport({ scale: 2.5 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, canvas, viewport }).promise;
  return tessRecognize(canvas.toBuffer('image/png'));
}

ipcMain.handle('md-convert-pdf', async (event, filePath) => {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(await fs.readFile(filePath)); // pdfjs 6 không nhận Buffer
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  const maxPages = Math.min(doc.numPages, 50);
  const pageTexts = [];
  const emptyPages = [];
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const texts = textContent.items
      .filter(item => item.str)
      .map(item => item.str)
      .join(' ')
      .trim();
    pageTexts[i] = texts;
    if (texts.length < 20) emptyPages.push(i); // trang scan: gần như không có lớp chữ
  }

  let ocrPages = 0;
  let ocrError = null;
  const left = [];
  for (const n of emptyPages) {
    try {
      const text = await tessOcrPdfPage(doc, n);
      if (text) { pageTexts[n] = text; ocrPages++; }
    } catch (e) {
      ocrError = `Tesseract: ${e.message}`;
      left.push(n);
    }
  }
  loadingTask.destroy();
  if (left.length) { // dự phòng: PaddleOCR nếu đã cài
    try {
      const res = await runOcr(['--pdf', filePath, '--pages', left.join(',')]);
      for (const r of res) {
        if (r.text && r.text.trim()) { pageTexts[r.page] = r.text.trim(); ocrPages++; }
      }
      ocrError = null;
    } catch (e) {
      ocrError = `${ocrError}; PaddleOCR: ${e.message}`;
    }
  }

  let md = '';
  for (let i = 1; i <= maxPages; i++) {
    if (pageTexts[i]) md += `## Trang ${i}\n\n${pageTexts[i]}\n\n`;
  }
  return { markdown: md.trim(), totalPages: doc.numPages, renderedPages: maxPages, ocrPages, ocrError };
});

ipcMain.handle('md-convert-image', async (event, filePath) => {
  try {
    return { markdown: await tessRecognize(filePath) };
  } catch (e) {
    const pages = await runOcr(['--image', filePath]); // dự phòng: PaddleOCR
    return { markdown: ((pages[0] && pages[0].text) || '').trim() };
  }
});

// .doc cũ (Word 97-2003): chỉ lấy chữ, không giữ định dạng/bảng
ipcMain.handle('md-convert-doc', async (event, filePath) => {
  const WordExtractor = require('word-extractor');
  const doc = await new WordExtractor().extract(filePath);
  const body = String(doc.getBody() || '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { markdown: body };
});

// .xls cũ (Excel 97-2003) qua SheetJS, cùng dạng bảng và giới hạn dòng như .xlsx
ipcMain.handle('md-convert-xls', async (event, filePath) => {
  const XLSX = require('xlsx');
  const wb = XLSX.read(await fs.readFile(filePath), { type: 'buffer', cellDates: true });
  let md = '';
  for (const name of wb.SheetNames) {
    md += `# ${name}\n\n`;
    const all = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false });
    if (!all.length) { md += '*(Sheet trống)*\n\n'; continue; }
    const cols = Math.max(...all.map((r) => r.length));
    const rows = all.slice(0, XLSX_MAX_ROWS).map((r) => Array.from({ length: cols }, (_, i) => mdCell(r[i])));
    const [header, ...body] = rows;
    md += `| ${header.join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |\n`;
    for (const r of body) md += `| ${r.join(' | ')} |\n`;
    if (all.length > XLSX_MAX_ROWS) md += `\n*... (${all.length - XLSX_MAX_ROWS} dòng bị cắt để giới hạn kích thước)*\n`;
    md += '\n';
  }
  return { markdown: md.trim() };
});

const xmlUnescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// Gom các đoạn chữ (<a:p>) trong một đoạn XML; chấp nhận <a:t xml:space="preserve"> và <a:br/>
function pptxParas(xml) {
  const paras = [];
  for (const p of xml.match(/<a:p[ >][\s\S]*?<\/a:p>/g) || []) {
    const text = (p.match(/<a:t(?:\s[^>]*)?>[^<]*<\/a:t>|<a:br\s*\/>/g) || [])
      .map((t) => (t.startsWith('<a:br') ? ' ' : xmlUnescape(t.replace(/<[^>]+>/g, ''))))
      .join('').replace(/\s+/g, ' ').trim();
    if (text) paras.push(text);
  }
  return paras;
}

// Bảng PowerPoint (<a:tbl>) → bảng Markdown, hàng đầu là tiêu đề
function pptxTable(tbl) {
  const rows = (tbl.match(/<a:tr[ >][\s\S]*?<\/a:tr>/g) || []).map((tr) =>
    (tr.match(/<a:tc[ >][\s\S]*?<\/a:tc>/g) || []).map((tc) => mdCell(pptxParas(tc).join(' '))));
  if (!rows.length) return '';
  const cols = Math.max(...rows.map((r) => r.length));
  const [h, ...b] = rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] || ''));
  return `| ${h.join(' | ')} |\n| ${h.map(() => '---').join(' | ')} |\n` + b.map((r) => `| ${r.join(' | ')} |\n`).join('');
}

ipcMain.handle('md-convert-pptx', async (event, filePath) => {
  const zip = await JSZip.loadAsync(await fs.readFile(filePath));
  const slides = Object.keys(zip.files)
    .map((n) => ({ n, m: /^ppt\/slides\/slide(\d+)\.xml$/.exec(n) }))
    .filter((x) => x.m)
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]));
  let md = '';
  for (const { n, m } of slides) {
    let xml = await zip.files[n].async('string');
    const tables = (xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/g) || []).map(pptxTable).filter(Boolean);
    xml = xml.replace(/<a:tbl>[\s\S]*?<\/a:tbl>/g, '');
    const paras = pptxParas(xml);

    // Ghi chú của slide: tìm qua file quan hệ slideN.xml.rels → notesSlides/notesSlideK.xml
    let notes = [];
    const relsFile = zip.files[`ppt/slides/_rels/slide${m[1]}.xml.rels`];
    if (relsFile) {
      const nm = /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(await relsFile.async('string'));
      const noteFile = nm && zip.files[`ppt/notesSlides/${nm[1]}`];
      if (noteFile) {
        const nx = await noteFile.async('string');
        const body = (nx.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || []).find((s) => /<p:ph[^>]*type="body"/.test(s));
        if (body) notes = pptxParas(body);
      }
    }

    if (!paras.length && !tables.length && !notes.length) continue;
    const [title = '', ...rest] = paras;
    md += `## Slide ${m[1]}${title ? ': ' + title : ''}\n\n`;
    if (rest.length) md += `${rest.map((t) => `- ${t}`).join('\n')}\n\n`;
    for (const t of tables) md += `${t}\n`;
    if (notes.length) md += `> **Ghi chú:** ${notes.join(' ')}\n\n`;
  }
  return { markdown: md.trim(), slides: slides.length };
});

ipcMain.handle('md-convert-html', async (event, { html, filePath }) => {
  const source = filePath ? await fs.readFile(filePath, 'utf8') : String(html || '');
  return { markdown: createTurndown().turndown(source) };
});

// ════════════════════════════════════════════════════════════════════
// IPC: VIENEU TTS (Python wrapper, chạy main process, offline, không cần key)
// ════════════════════════════════════════════════════════════════════
// Python không đọc được file trong app.asar → dùng bản asarUnpack khi đã đóng gói
const VIENEU_WRAPPER = path.join(__dirname, 'tts_vienieu.py')
  .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

// Ưu tiên: biến môi trường MDR_PYTHON → venv riêng của app → python hệ thống
function pythonCmd() {
  if (process.env.MDR_PYTHON) return process.env.MDR_PYTHON;
  if (process.platform === 'win32') {
    const venvPy = path.join(process.env.LOCALAPPDATA || '', 'MDReaderPro', 'venv', 'Scripts', 'python.exe');
    if (require('node:fs').existsSync(venvPy)) return venvPy;
    return 'python';
  }
  return 'python3';
}

// Một tiến trình Python dùng chung: nạp model một lần, trao đổi JSON theo dòng qua stdin/stdout.
// Nếu tiến trình chết, các yêu cầu đang chờ bị từ chối và lần gọi sau sẽ khởi động lại.
let vienieuProc = null;
let vienieuSeq = 0;
let vienieuErrTail = '';
const vienieuPending = new Map();

function vienieuDied(proc, err) {
  if (vienieuProc !== proc) return; // sự kiện trùng hoặc của tiến trình cũ
  vienieuProc = null;
  for (const { reject } of vienieuPending.values()) reject(err);
  vienieuPending.clear();
}

function getVienieu() {
  if (vienieuProc) return vienieuProc;
  vienieuErrTail = '';
  const proc = spawn(pythonCmd(), [VIENEU_WRAPPER, '--serve'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');
  proc.stdin.on('error', () => {}); // EPIPE khi Python đã thoát; lỗi được báo qua 'exit'

  let buf = '';
  proc.stdout.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      const p = vienieuPending.get(msg.id);
      if (!p) continue;
      vienieuPending.delete(msg.id);
      if (msg.ok) p.resolve(msg);
      else p.reject(new Error(msg.error || 'Lỗi VieNeu TTS'));
    }
  });
  proc.stderr.on('data', (c) => { vienieuErrTail = (vienieuErrTail + c).slice(-2000); });
  proc.on('error', (e) => vienieuDied(proc, new Error(`Không chạy được Python: ${e.message}`)));
  proc.on('exit', (code) => {
    const detail = vienieuErrTail.trim().slice(-500);
    vienieuDied(proc, new Error(detail || `VieNeu TTS dừng bất ngờ (mã ${code})`));
  });

  vienieuProc = proc;
  return proc;
}

function vienieuRequest(payload) {
  return new Promise((resolve, reject) => {
    const proc = getVienieu();
    const id = ++vienieuSeq;
    vienieuPending.set(id, { resolve, reject });
    proc.stdin.write(JSON.stringify({ id, ...payload }) + '\n');
  });
}

app.on('will-quit', () => { if (vienieuProc) vienieuProc.kill(); });

ipcMain.handle('md-tts-vienieu-list-voices', async () => {
  try {
    const res = await vienieuRequest({ cmd: 'list' });
    const voices = (res.voices || []).map((v) => ({
      name: v.id,
      shortName: v.id,
      locale: 'vi-VN',
      gender: 'unknown',
      description: v.description
    }));
    return { voices };
  } catch (e) {
    return { voices: [], error: e.message };
  }
});

ipcMain.handle('md-tts-vienieu-speak', async (event, { text, voice }) => {
  const tmp = path.join(os.tmpdir(), `mdr-tts-${randomUUID()}.wav`);
  try {
    await vienieuRequest({ cmd: 'speak', text: String(text || ''), voice: voice || '', output: tmp });
    return { audio: await fs.readFile(tmp) };
  } finally {
    fs.unlink(tmp).catch(() => {});
  }
});

// ════════════════════════════════════════════════════════════════════
// IPC: SHELL (mở file explorer, thư mục)
// ════════════════════════════════════════════════════════════════════
ipcMain.handle('md-shell-show-item', async (event, filePath) => {
  await shell.showItemInFolder(filePath);
  return { ok: true };
});

ipcMain.handle('md-shell-open-path', async (event, filePath) => {
  await shell.openPath(filePath);
  return { ok: true };
});

// ════════════════════════════════════════════════════════════════════
// IPC: APP INFO
// ════════════════════════════════════════════════════════════════════
ipcMain.handle('md-app-info', () => ({
  name: 'MD Reader Pro',
  version: app.getVersion(),
  platform: process.platform,
  userDataPath: app.getPath('userData')
}));

// ════════════════════════════════════════════════════════════════════
// IPC: API KEYS (lưu trong userData/secrets.json, mã hóa bằng safeStorage)
// Renderer chỉ biết khóa đã có hay chưa, không bao giờ đọc lại giá trị.
// ════════════════════════════════════════════════════════════════════
const SECRET_NAMES = ['google', 'gemini', 'openai'];
const secretsFile = () => path.join(app.getPath('userData'), 'secrets.json');

async function readSecrets() {
  try {
    return JSON.parse(await fs.readFile(secretsFile(), 'utf8'));
  } catch {
    return {};
  }
}

async function getSecret(name) {
  const enc = (await readSecrets())[name];
  if (!enc || !safeStorage.isEncryptionAvailable()) return '';
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch {
    return '';
  }
}

ipcMain.handle('md-secret-status', async () => {
  const data = await readSecrets();
  const status = { encryptionAvailable: safeStorage.isEncryptionAvailable() };
  for (const name of SECRET_NAMES) status[name] = Boolean(data[name]);
  return status;
});

ipcMain.handle('md-secret-set', async (event, payload) => {
  const { name, value } = payload || {};
  if (!SECRET_NAMES.includes(name)) return { ok: false, error: 'Tên khóa không hợp lệ' };
  const trimmed = String(value || '').trim();
  const data = await readSecrets();
  if (!trimmed) {
    delete data[name];
  } else {
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: 'Hệ điều hành không hỗ trợ mã hóa khóa, không thể lưu' };
    }
    data[name] = safeStorage.encryptString(trimmed).toString('base64');
  }
  await fs.writeFile(secretsFile(), JSON.stringify(data), 'utf8');
  return { ok: true };
});

// ════════════════════════════════════════════════════════════════════
// IPC: TRANSLATE (gọi API từ main process để không bị CORS và khóa không lộ ra renderer)
// ════════════════════════════════════════════════════════════════════
const TRANSLATE_MAX_CHARS = 20000;
const TRANSLATE_TIMEOUT_MS = 60000;

function normalizeBaseUrl(url) {
  let u;
  try {
    u = new URL(String(url || '').trim());
  } catch {
    throw new Error('URL endpoint không hợp lệ');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error('URL endpoint phải bắt đầu bằng http:// hoặc https://');
  }
  return u.toString().replace(/\/+$/, '');
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(TRANSLATE_TIMEOUT_MS) });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const detail = data?.error?.message || data?.error || text.slice(0, 200) || '';
    const msg = typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 200);
    throw new Error(`HTTP ${res.status}${msg ? `: ${msg}` : ''}`);
  }
  return data;
}

function llmSystemPrompt(targetName) {
  return `Translate the user's text into ${targetName}. Keep all Markdown syntax (headings, lists, links, tables, code blocks) unchanged. Output only the translated text, with no explanation.`;
}

async function translateGoogle(text, targetCode) {
  const body = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: targetCode, dt: 't', q: text });
  const data = await fetchJson('https://translate.googleapis.com/translate_a/single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: body.toString()
  });
  const out = Array.isArray(data?.[0]) ? data[0].map((seg) => seg?.[0] || '').join('') : '';
  if (!out.trim()) throw new Error('Google Translate không trả về nội dung');
  return out;
}

async function translateGemini(text, targetName, model) {
  const key = await getSecret('gemini');
  if (!key) throw new Error('Chưa có khóa Gemini API');
  if (!model) throw new Error('Chưa chọn model Gemini');
  const name = String(model).replace(/^models\//, '');
  const data = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: llmSystemPrompt(targetName) }] },
        contents: [{ role: 'user', parts: [{ text }] }]
      })
    }
  );
  const out = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!out) throw new Error('Gemini không trả về nội dung');
  return out;
}

async function translateOpenAI(text, targetName, baseUrl, model) {
  if (!model) throw new Error('Chưa chọn model');
  const key = await getSecret('openai');
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  const data = await fetchJson(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: llmSystemPrompt(targetName) },
        { role: 'user', content: text }
      ]
    })
  });
  const out = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!out) throw new Error('Endpoint không trả về nội dung');
  return out;
}

ipcMain.handle('md-translate', async (event, payload) => {
  try {
    const { provider, text, targetCode, targetName, model, baseUrl } = payload || {};
    const input = String(text || '');
    if (!input.trim()) return { ok: false, error: 'Không có nội dung để dịch' };
    if (input.length > TRANSLATE_MAX_CHARS) {
      return { ok: false, error: `Nội dung quá dài (tối đa ${TRANSLATE_MAX_CHARS} ký tự)` };
    }
    const lang = String(targetName || 'Vietnamese');
    let translated;
    if (provider === 'google') translated = await translateGoogle(input, String(targetCode || 'vi'));
    else if (provider === 'gemini') translated = await translateGemini(input, lang, model);
    else if (provider === 'openai') translated = await translateOpenAI(input, lang, baseUrl, model);
    else return { ok: false, error: 'Nhà cung cấp không hợp lệ' };
    return { ok: true, text: translated };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('md-translate-list-models', async (event, payload) => {
  try {
    const { provider, baseUrl } = payload || {};
    if (provider === 'gemini') {
      const key = await getSecret('gemini');
      if (!key) throw new Error('Chưa có khóa Gemini API');
      const data = await fetchJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
        headers: { 'x-goog-api-key': key }
      });
      const models = (data?.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => String(m.name || '').replace(/^models\//, ''))
        .filter(Boolean)
        .sort();
      return { ok: true, models };
    }
    if (provider === 'openai') {
      const key = await getSecret('openai');
      const headers = {};
      if (key) headers.Authorization = `Bearer ${key}`;
      const data = await fetchJson(`${normalizeBaseUrl(baseUrl)}/models`, { headers });
      const models = (data?.data || []).map((m) => m.id).filter(Boolean).sort();
      return { ok: true, models };
    }
    return { ok: false, error: 'Nhà cung cấp này không hỗ trợ quét model' };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

