# PaperFlow · 安装指南（v1.0.0）

> 开箱即用的学术 PDF 翻译工具：保留原始排版、公式与图表，Windows / macOS 双平台，**无需安装 Python、无需配置环境**。

---

## 一、系统要求

| 项目 | Windows | macOS |
| --- | --- | --- |
| 系统版本 | Windows 10 / 11（64 位） | macOS 13.0+ |
| 芯片 | x64 | Apple Silicon (M 系列) / Intel |
| 内存 | 4 GB 起（大文档建议 8 GB） | 4 GB 以上 |
| 磁盘 | 约 750 MB | 约 750 MB |
| 网络 | 使用在线翻译服务时需要联网 | 同左 |

---

## 二、方式 A：下载发行包（推荐）

### 1. 下载

到 **[Releases 页面](https://github.com/GW19ddd/PaperFlow/releases/latest)** 下载对应平台的压缩包：

| 平台 | 文件 |
| --- | --- |
| 🪟 Windows | `paperflow-desktop-win-v1.0.0.zip` |
| 🍎 macOS | `paperflow-desktop-mac-v1.0.0.zip` |

> ⚠️ 不要点 **Source code** —— 那是源码包，解压后不能直接双击运行。

### 2. 启动

**Windows**

1. 右键压缩包 → 「全部解压缩」到任意位置（建议「下载」或「桌面」）
2. 进入解压出来的 `paperflow-desktop-win` 文件夹
3. 双击 **`paperflow.exe`** 即可启动

可选操作（都不是启动的必要条件）：

- `install.bat` —— 创建桌面快捷方式 / 开始菜单项，并自动检查安装 VC++ 运行库
- `paperflow.vbs` —— 无控制台窗口启动（Windows 11 24H2 已废弃 VBScript，建议用 `.exe` 或 `.bat`）
- `debug_start.bat` —— 带控制台输出与自检的启动方式，排错时用
- `diagnostic.bat` —— 生成系统诊断报告
- `uninstall.bat` —— 卸载快捷方式

**macOS**

1. 双击 zip 解压，得到 `paperflow.app`
2. 把它拖进「应用程序」文件夹
3. 双击启动

首次启动若被系统拦截：

- 提示「**已损坏，无法打开**」→ 终端执行 `xattr -cr /Applications/paperflow.app`
- 提示「**无法验证开发者**」→ Finder 里 **右键 → 打开**，点「打开」确认（仅需一次）

---

## 三、方式 B：从源码仓库构建

适合想改代码或自行打包的场景。

```bash
git clone https://github.com/GW19ddd/PaperFlow.git
cd PaperFlow
```

打包发布：仓库根目录已提供 `publish.bat`（Windows），会自动同步代码、打包并上传到 GitHub Release：

```bat
publish.bat              :: 打包并上传到最新 tag 的 Release
publish.bat 1.0.0        :: 指定版本号（对应 tag v1.0.0）
publish.bat --local      :: 只打包不上传，用于本地验证
```

> GitHub Actions 也提供了 `.github/workflows/incremental-release.yml`：打 tag 触发时，会基于上一个 Release 的压缩包做**增量打包**（运行时不入库，只覆盖代码部分）。

---

## 四、首次使用

1. 启动后进入「翻译」页，把一篇外文 PDF 拖进虚线框
2. 翻译服务先选 **Google 翻译**（免费、无需配置），点「开始翻译」
3. 出结果后，到「设置」页给 DeepSeek / 通义千问等配 API Key，质量会有明显提升
4. 完整图文说明见 **[docs/tutorial.html](docs/tutorial.html)**（用浏览器打开）

> 💡 想省时间：先翻 1-3 页确认服务可用，再整篇开跑。翻译有缓存，中途断掉重跑会接着翻。

---

## 五、目录说明

解压后目录下这些是日常会用到的：

```text
paperflow-desktop-win/
├── paperflow.exe        ⭐ 主程序（双击它）
├── paperflow.bat        ⭐ 带控制台的等价启动方式
├── core/
│   ├── runtime/         ⚙️ 内置 Python 3.12
│   └── site-packages/   📦 已打包的依赖
├── config/              ⚙️ 配置文件（不要手改）
├── logs/                📋 运行日志，排错时看这里
├── paperflow_files/     📄 译文输出目录
├── install.bat          📥 创建快捷方式 + 补 VC++ 运行库
└── diagnostic.bat       🩺 系统自检工具
```

macOS 版本对应 `~/Library/Logs/paperflow-desktop/`（日志）和 `~/Documents/paperflow_files/`（译文）。

---

## 六、卸载

- **Windows**：双击 `uninstall.bat`，之后直接删除解压出来的文件夹即可
- **macOS**：把 `paperflow.app` 从「应用程序」拖到废纸篓；可选清理 `~/Documents/paperflow_files/`（译文）和配置目录

---

## 七、遇到问题

1. 先看 [README 的常见问题表](README.md#-常见问题)
2. 图文排障见 `docs/tutorial.html` 的 FAQ 章节
3. 仍解决不了：带着 `logs/` 下的日志到 [GitHub Issues](https://github.com/GW19ddd/PaperFlow/issues) 反馈，或邮件联系 `2994574297@qq.com`
