const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ══════════════════════════════════════════════════════════════════
  // FILE SYSTEM
  // ══════════════════════════════════════════════════════════════════
  fsRead: (filePath) => ipcRenderer.invoke('md-fs-read', filePath),
  fsWrite: ({ filePath, content }) => ipcRenderer.invoke('md-fs-write', { filePath, content }),
  fsSaveAs: ({ content, defaultName }) => ipcRenderer.invoke('md-fs-save-as', { content, defaultName }),
  fsSaveBinary: ({ data, defaultName }) => ipcRenderer.invoke('md-fs-save-binary', { data, defaultName }),
  fsOpenDialog: () => ipcRenderer.invoke('md-fs-open-dialog'),
  fsImportDialog: () => ipcRenderer.invoke('md-fs-import-dialog'),
  // Electron mới không còn File.path; lấy đường dẫn thật của file kéo thả qua webUtils
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // ══════════════════════════════════════════════════════════════════
  // CONVERT (DOCX / XLSX / PDF / HTML → Markdown)
  // ══════════════════════════════════════════════════════════════════
  convertDocx: (filePath) => ipcRenderer.invoke('md-convert-docx', filePath),
  convertXlsx: (filePath) => ipcRenderer.invoke('md-convert-xlsx', filePath),
  convertPdf: (filePath) => ipcRenderer.invoke('md-convert-pdf', filePath),
  convertPptx: (filePath) => ipcRenderer.invoke('md-convert-pptx', filePath),
  convertDoc: (filePath) => ipcRenderer.invoke('md-convert-doc', filePath),
  convertXls: (filePath) => ipcRenderer.invoke('md-convert-xls', filePath),
  convertImage: (filePath) => ipcRenderer.invoke('md-convert-image', filePath),
  convertHtml: (html) => ipcRenderer.invoke('md-convert-html', { html }),
  convertHtmlFile: (filePath) => ipcRenderer.invoke('md-convert-html', { filePath }),

  // ══════════════════════════════════════════════════════════════════
  // TTS (VieNeu-TTS - Python wrapper, chạy main process)
  // ══════════════════════════════════════════════════════════════════
  ttsVienieuListVoices: () => ipcRenderer.invoke('md-tts-vienieu-list-voices'),
  ttsVienieuSpeak: ({ text, voice }) => ipcRenderer.invoke('md-tts-vienieu-speak', { text, voice }),

  // ══════════════════════════════════════════════════════════════════
  // SHELL
  // ══════════════════════════════════════════════════════════════════
  shellShowItem: (filePath) => ipcRenderer.invoke('md-shell-show-item', filePath),
  shellOpenPath: (filePath) => ipcRenderer.invoke('md-shell-open-path', filePath),

  // ══════════════════════════════════════════════════════════════════
  // APP INFO
  // ══════════════════════════════════════════════════════════════════
  appInfo: () => ipcRenderer.invoke('md-app-info'),

  // ══════════════════════════════════════════════════════════════════
  // EXTERNAL FILE OPEN (double-click .md từ Explorer)
  // ══════════════════════════════════════════════════════════════════
  onFileOpenExternal: (callback) => ipcRenderer.on('md-file-open-external', (_, filePath) => callback(filePath)),

  // ══════════════════════════════════════════════════════════════════
  // ENV
  // ══════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════
  // TRANSLATE (Google / Gemini / API tương thích OpenAI, khóa API do main process giữ)
  // ══════════════════════════════════════════════════════════════════
  translate: (payload) => ipcRenderer.invoke('md-translate', payload),
  translateListModels: (payload) => ipcRenderer.invoke('md-translate-list-models', payload),
  secretSet: (payload) => ipcRenderer.invoke('md-secret-set', payload),
  secretStatus: () => ipcRenderer.invoke('md-secret-status'),

  isElectron: true,
  platform: process.platform
});