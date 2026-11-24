import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { prefGet, prefSet } from "../utils/prefs";
import { debugLog, debugLogPath } from "../utils/debug";
import { launchPaperFlow, launchPaperFlowBatch, PaperFlowLaunchInfo } from "./launcher";

/**
 * 右键菜单：
 *   - 条目树（zotero-itemmenu）：完整子菜单（一键翻译 / 各格式 / 静默开关 / 打开配置）
 *   - PDF reader（Zotero 9+）：通过 Zotero.Reader.registerEventListener 向动态右键菜单
 *     注入同样的子菜单，翻译 reader 当前打开的 PDF
 */

export interface PdfInfo extends PaperFlowLaunchInfo {
  path: string;
  itemID?: number;
  filename?: string;
  sourceTitle?: string;
  /** 已翻译 / 已是中文 —— 弹窗里默认不勾选并标注 */
  skipReason?: "translated" | "chinese";
}

const TRANSLATED_SUFFIXES = ["-mono", "-dual", "-side_by_side", "-translated"];

function isTranslatedName(nameOrPath: string): boolean {
  const name = String(nameOrPath || "").replace(/\\/g, "/").split("/").pop() || "";
  return TRANSLATED_SUFFIXES.some(s => name.toLowerCase().endsWith(s + ".pdf"));
}

function isChineseLanguage(value: string): boolean {
  const s = String(value || "").trim().toLowerCase();
  return /^(zh|chi|zho|cmn|chinese|中文|汉语)/.test(s) || /中文|汉语|简体中文|繁体中文/.test(s);
}

async function hasTranslatedSibling(path: string): Promise<boolean> {
  try {
    const normalized = String(path || "").replace(/\\/g, "/");
    const slash = normalized.lastIndexOf("/");
    if (slash < 0) return false;
    const dir = normalized.slice(0, slash);
    const stem = normalized.slice(slash + 1).replace(/\.pdf$/i, "");
    const io = (globalThis as any).IOUtils;
    if (!io || typeof io.exists !== "function") return false;
    for (const suffix of TRANSLATED_SUFFIXES) {
      if (await io.exists(`${dir}/${stem}${suffix}.pdf`)) return true;
    }
  } catch (e) {
    /* 无法检查同目录就当作没有 */
  }
  return false;
}

async function pdfInfoFromAttachment(att: any, parent: any): Promise<PdfInfo | null> {
  if (!att || att.attachmentContentType !== "application/pdf") return null;
  const p = await att.getFilePathAsync();
  if (!p) return null;
  const filename = String(p).replace(/\\/g, "/").split("/").pop() || String(p);
  const info: PdfInfo = {
    path: p,
    key: att.key,
    linkMode: att.attachmentLinkMode,
    itemID: att.id,
    filename,
    sourceTitle: parent && parent.getField ? String(parent.getField("title") || "") : "",
  };

  const attTitle = att.getField ? String(att.getField("title") || "") : "";
  // 译文附件本身不需要再翻译（可能是用户把译文一起选中了）
  if (isTranslatedName(filename) || attTitle.startsWith("译文")) {
    info.skipReason = "translated";
    return info;
  }
  // 条目元数据标了中文，文件名是中文也当作中文 PDF
  const lang = parent && parent.getField ? String(parent.getField("language") || "") : "";
  if (isChineseLanguage(lang) || /[\u4e00-\u9fff]/.test(filename)) {
    info.skipReason = "chinese";
    return info;
  }
  // 同目录已有 -mono/-dual/-side_by_side 译文文件
  if (await hasTranslatedSibling(p)) {
    info.skipReason = "translated";
    return info;
  }
  // imported 模式：译文在 Zotero storage 里，按附件标题「译文 · …」识别
  try {
    const siblings: number[] = parent && parent.getAttachments ? parent.getAttachments() : [];
    for (const id of siblings) {
      const sib = Zotero.Items.get(id);
      const t = sib && sib.getField ? String(sib.getField("title") || "") : "";
      if (t.startsWith("译文 ·")) {
        info.skipReason = "translated";
        break;
      }
    }
  } catch (e) {
    /* ignore */
  }
  return info;
}


function alertUser(title: string, msg: string): void {
  try {
    Zotero.alert(Zotero.getMainWindow() as any, title, msg);
  } catch (e) {
    /* ignore */
  }
}

function isSilentMode(): boolean {
  return prefGet("silent", false) === true;
}

function toggleSilentMode(): boolean {
  const now = !isSilentMode();
  prefSet("silent", now);
  return now;
}

function defaultFormat(): string {
  const v = prefGet("format", "side_by_side");
  return ["side_by_side", "dual", "mono", "all"].includes(v) ? v : "side_by_side";
}

async function getSelectedPdfPaths(): Promise<PdfInfo[]> {
  const win = Zotero.getMainWindow() as any;
  if (!win || !win.ZoteroPane) return [];
  const items: any[] = win.ZoteroPane.getSelectedItems();
  const infos: PdfInfo[] = [];
  for (const item of items) {
    // 选中项本身就是 PDF 附件
    if (
      typeof item.isAttachment === "function" &&
      item.isAttachment() &&
      item.attachmentContentType === "application/pdf"
    ) {
      const parent = item.parentItemID ? Zotero.Items.get(item.parentItemID) : null;
      const info = await pdfInfoFromAttachment(item, parent);
      if (info) infos.push(info);
      continue;
    }
    // 普通文献条目：取它的 PDF 附件
    if (typeof item.isRegularItem === "function" && item.isRegularItem()) {
      const attIds = item.getAttachments();
      for (const attId of attIds) {
        const info = await pdfInfoFromAttachment(Zotero.Items.get(attId), item);
        if (info) infos.push(info);
      }
    }
  }
  return infos;
}

/**
 * 选中项里含多个 PDF 时，先弹出勾选框让用户挑要翻译的文件。
 * 对话框不可用（老版本 Zotero / openDialog 缺失）时回退为全部翻译，不影响原有功能。
 */
async function pickPdfsToTranslate(infos: PdfInfo[]): Promise<PdfInfo[]> {
  // 单个正常 PDF 直接翻译；单个被标记跳过的也弹窗，让用户看到原因并可强制翻译
  if (infos.length === 0 || (infos.length === 1 && !infos[0].skipReason)) return infos;
  const win = Zotero.getMainWindow() as any;
  if (!win || typeof win.openDialog !== "function") {
    debugLog("openDialog unavailable -> skip filtered PDFs");
    return infos.filter(i => !i.skipReason);
  }
  const items = infos.map((info, index) => ({
    index,
    title: String(info.sourceTitle || "").slice(0, 100),
    filename:
      info.filename ||
      String(info.path || "").replace(/\\/g, "/").split("/").pop() ||
      info.path,
    skipReason: info.skipReason || "",
    checked: !info.skipReason,
  }));
  const data: any = {
    items,
    selected: [] as number[],
    filters: { translated: true, chinese: true },
  };
  try {
    win.openDialog(
      `chrome://${config.addonRef}/content/pdf-select.xhtml`,
      "_blank",
      "chrome,modal,centerscreen,resizable",
      data
    );
  } catch (e) {
    debugLog("pickPdfsToTranslate dialog failed: " + e + " -> translate all");
    return infos;
  }
  if (!Array.isArray(data.selected) || data.selected.length === 0) {
    debugLog("pickPdfsToTranslate: nothing selected -> abort");
    return [];
  }
  return data.selected.map((i: number) => infos[i]).filter(Boolean);
}

export async function triggerTranslate(
  format: string | null,
  auto: boolean,
  infosOverride?: PdfInfo[]
): Promise<void> {
  debugLog("=== triggerTranslate called format=" + format + " auto=" + auto + " ===");
  try {
    const infos = infosOverride || (await getSelectedPdfPaths());
    debugLog("selected pdf count=" + infos.length);
    if (infos.length === 0) {
      alertUser(
        "PaperFlow Connector",
        "请先选中 PDF 附件或含 PDF 的文献条目（支持多选）\n(paperflow-desktop Connector)"
      );
      return;
    }
    // 多于一个 PDF 时先让用户勾选（支持全选/全不选/单选几个）
    const picked = await pickPdfsToTranslate(infos);
    if (picked.length === 0) {
      debugLog("=== triggerTranslate cancelled by user ===");
      return;
    }
    // 多选条目 → 一次性把选中的 PDF 及其附件 key 传给桌面端，由 App 批量翻译、
    // 逐个回写；不再为每个 PDF 起一个进程（那样元数据会串位、还会反复抢占单实例）。
    await launchPaperFlowBatch(picked, format, auto);
    debugLog("=== triggerTranslate DONE count=" + picked.length + " ===");
  } catch (e: any) {
    debugLog(
      "triggerTranslate EXCEPTION: " + e + " stack=" + (e && e.stack ? e.stack : "no-stack")
    );
    alertUser(
      "PaperFlow Connector",
      "右键翻译失败：\n" + String(e) + "\n\n日志已写到：" + debugLogPath()
    );
  }
}

/** reader 当前打开的 PDF → 翻译（reader 实例直接来自 reader 菜单事件） */
async function triggerReaderTranslate(reader: any, format: string | null, auto: boolean): Promise<void> {
  try {
    const itemID = reader && reader.itemID;
    if (!itemID) {
      alertUser("PaperFlow Connector", "未找到当前打开的 PDF（reader）");
      return;
    }
    const item = Zotero.Items.get(itemID);
    if (!item || item.attachmentContentType !== "application/pdf") {
      alertUser("PaperFlow Connector", "当前 reader 打开的附件不是 PDF");
      return;
    }
    const p = await item.getFilePathAsync();
    if (!p) {
      alertUser("PaperFlow Connector", "无法获取当前 PDF 的文件路径");
      return;
    }
    debugLog("=== triggerReaderTranslate file=" + p + " format=" + format + " ===");
    await launchPaperFlow(p, format, auto, {
      key: item.key,
      linkMode: item.attachmentLinkMode,
      itemID: item.id,
    });
  } catch (e: any) {
    debugLog("triggerReaderTranslate EXCEPTION: " + e);
    alertUser("PaperFlow Connector", "reader 翻译失败：\n" + String(e));
  }
}
type TranslateHandler = (format: string | null, auto: boolean) => void;

interface MenuItemDef {
  label: string;
  separator?: boolean;
  useDefault?: boolean;
  format?: string;
  auto?: boolean;
  silent?: boolean;
}

function buildTranslateMenu(doc: Document, onTranslate: TranslateHandler): any {
  const create = (tag: string) =>
    (doc as any).createXULElement ? (doc as any).createXULElement(tag) : doc.createElement(tag);
  const menu = create("menu");
  menu.id = "paperflow-translate-menu";
  menu.setAttribute("label", getString("menu-translate-label"));

  const subpopup = create("menupopup");
  const defs: MenuItemDef[] = [
    { label: getString("menu-one-click"), useDefault: true, auto: true },
    { label: "─────────", separator: true },
    { label: getString("menu-side-by-side"), format: "side_by_side", auto: false },
    { label: getString("menu-dual"), format: "dual", auto: false },
    { label: getString("menu-mono"), format: "mono", auto: false },
    { label: getString("menu-all"), format: "all", auto: false },
    { label: "─────────", separator: true },
    { label: getString("menu-silent"), silent: true },
    { label: "─────────", separator: true },
    { label: "⚙️ " + getString("menu-open-config"), useDefault: false, format: undefined, auto: false },
  ];

  let silentItem: any = null;
  for (const def of defs) {
    if (def.separator) {
      subpopup.appendChild(create("menuseparator"));
      continue;
    }
    const mi = create("menuitem");
    mi.setAttribute("label", def.label);
    if (def.silent) {
      mi.setAttribute("type", "checkbox");
      mi.setAttribute("autocheck", "false");
      silentItem = mi;
      mi.addEventListener("command", () => {
        const on = toggleSilentMode();
        mi.setAttribute("checked", on ? "true" : "false");
      });
    } else {
      mi.addEventListener("command", () => {
        // 「打开配置」= format null auto false → 唤起 app 打开该 PDF，用户手动配置翻译
        const fmt = def.useDefault ? defaultFormat() : def.format || null;
        onTranslate(fmt, def.useDefault ? true : false);
      });
    }
    subpopup.appendChild(mi);
  }

  // 每次打开菜单时同步静默开关的勾选状态
  subpopup.addEventListener("popupshowing", () => {
    if (silentItem) silentItem.setAttribute("checked", isSilentMode() ? "true" : "false");
  });

  menu.appendChild(subpopup);
  return menu;
}

/** 条目树右键菜单 */
export function installItemContextMenu(win: Window): void {
  try {
    if (!win || !win.document) return;
    const doc = win.document;
    const menupopup = doc.getElementById("zotero-itemmenu");
    if (!menupopup) return;
    if (doc.getElementById("paperflow-translate-menu")) return;
    const menu = buildTranslateMenu(doc, (fmt, auto) => {
      void triggerTranslate(fmt, auto);
    });
    menupopup.appendChild(menu);
    debugLog("item context menu installed");
  } catch (e) {
    debugLog("installItemContextMenu error: " + e);
  }
}

function removeItemContextMenu(win: Window): void {
  try {
    if (!win || !win.document) return;
    const m = win.document.getElementById("paperflow-translate-menu");
    if (m && m.parentNode) m.parentNode.removeChild(m);
  } catch (e) {
    /* ignore */
  }
}

/**
 * PDF reader 右键菜单（Zotero 9+）：
 * reader.xhtml 不再有静态的 zotero-reader-context-menu，右键菜单由 reader 动态生成。
 * 插件通过 Zotero.Reader.registerEventListener('createViewContextMenu' / 'createAnnotationContextMenu')
 * 把「用 paperflow-desktop 翻译」子菜单追加进菜单项（append 必须同步调用）。
 */
type ReaderMenuEvent = {
  reader: any;
  params: any;
  append: (...items: any[]) => void;
};

interface ReaderMenuItem {
  label: string;
  checked?: boolean;
  onCommand?: () => void;
  groups?: ReaderMenuItem[][];
}

function buildReaderMenu(reader: any): any | null {
  try {
    const itemID = reader && reader.itemID;
    if (!itemID) return null;
    const item = Zotero.Items.get(itemID);
    if (!item || item.attachmentContentType !== "application/pdf") return null;
    const mk = (label: string, onCommand: () => void): ReaderMenuItem => ({ label, onCommand });
    // 每个 group 之间由原生菜单渲染为分隔线，结构对齐条目树子菜单
    const groups: ReaderMenuItem[][] = [
      [
        mk(getString("menu-one-click"), () => {
          void triggerReaderTranslate(reader, defaultFormat(), true);
        }),
      ],
      [
        mk(getString("menu-side-by-side"), () => {
          void triggerReaderTranslate(reader, "side_by_side", false);
        }),
        mk(getString("menu-dual"), () => {
          void triggerReaderTranslate(reader, "dual", false);
        }),
        mk(getString("menu-mono"), () => {
          void triggerReaderTranslate(reader, "mono", false);
        }),
        mk(getString("menu-all"), () => {
          void triggerReaderTranslate(reader, "all", false);
        }),
      ],
      [
        {
          label: getString("menu-silent"),
          checked: isSilentMode(),
          onCommand: () => {
            toggleSilentMode();
          },
        },
      ],
      [
        mk(getString("menu-open-config"), () => {
          // format null auto false → 唤起 app 打开该 PDF，用户手动配置翻译
          void triggerReaderTranslate(reader, null, false);
        }),
      ],
    ];
    return {
      label: getString("menu-translate-label"),
      groups,
    };
  } catch (e) {
    debugLog("buildReaderMenu error: " + e);
    return null;
  }
}

const readerMenuHandlers = new Map<string, (event: ReaderMenuEvent) => void>();

function registerReaderMenuEvent(type: string): void {
  try {
    const readerTool = (Zotero as any).Reader;
    if (!readerTool || typeof readerTool.registerEventListener !== "function") return;
    if (readerMenuHandlers.has(type)) return;
    const handler = (event: ReaderMenuEvent) => {
      try {
        if (!event || typeof event.append !== "function") return;
        const menu = buildReaderMenu(event.reader);
        if (menu) event.append(menu);
      } catch (e) {
        debugLog("reader menu event " + type + " error: " + e);
      }
    };
    readerTool.registerEventListener(type, handler, addon.data.config.addonID);
    readerMenuHandlers.set(type, handler);
    debugLog("reader menu event registered: " + type);
  } catch (e) {
    debugLog("registerReaderMenuEvent " + type + " FAILED: " + e);
  }
}

function installReaderMenuEvents(): void {
  registerReaderMenuEvent("createViewContextMenu");
  registerReaderMenuEvent("createAnnotationContextMenu");
}

function uninstallReaderMenuEvents(): void {
  try {
    const readerTool = (Zotero as any).Reader;
    if (readerTool && typeof readerTool.unregisterEventListener === "function") {
      for (const [type, handler] of readerMenuHandlers) {
        try {
          readerTool.unregisterEventListener(type, handler);
        } catch (e) {
          /* ignore */
        }
      }
    }
  } catch (e) {
    /* ignore */
  }
  readerMenuHandlers.clear();
}

let readerEventsInstalled = false;

/** 主窗口加载：安装条目树菜单 + 注册 reader 菜单事件 */
export function installContextMenus(win: Window): void {
  installItemContextMenu(win);
  if (!readerEventsInstalled) {
    installReaderMenuEvents();
    readerEventsInstalled = true;
  }
}

export function uninstallContextMenus(): void {
  uninstallReaderMenuEvents();
  readerEventsInstalled = false;
  try {
    const wm = (Components.classes as any)["@mozilla.org/appshell/window-mediator;1"].getService(
      Components.interfaces.nsIWindowMediator
    );
    const enumerator = wm.getEnumerator("navigator:browser");
    while (enumerator.hasMoreElements()) {
      const win = enumerator.getNext();
      removeItemContextMenu(win as Window);
    }
  } catch (e) {
    /* ignore */
  }
}
