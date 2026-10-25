> English localization branch: see [LOCALIZATION.md](LOCALIZATION.md) for current implementation and verification. The original snapshot remains in `upstream/`; frontend modules now contain English rendering templates.

# Brassworld — An Industrial Atlas

英文界面与 Parallels 风格的本地改版。没有发布网站。

更新：修复 Windows 默认文本编码导致地图无法加载的问题；同时明确设置 JavaScript / JSON 文件类型。

## 在 Windows 上打开

1. 把压缩包完整解压到一个文件夹。不要在压缩包内直接运行。
2. 电脑需要 Python 3（使用标准库，不需要安装额外 Python 包）。
3. 双击 `start_windows.bat`，保留打开的命令窗口。
4. 在浏览器打开 **http://localhost:3000**。
5. 选择 AI 难度与头像，然后点击 **Begin the game**。

如果双击没有启动，可在此文件夹打开终端，运行：

```bash
python serve.py
```

macOS / Linux：在此文件夹运行 `python3 serve.py`。
如果 3000 端口已被占用，运行 `python serve.py --port 3001`，然后访问 http://localhost:3001。

## 本版做了什么

- 使用米白纸张、棕色墨线、橄榄色陆地和柔和航线。
- 使用与参考网站一致的 Playfair Display / EB Garamond 英文字体。
- 重新设计菜单、玩家信息、卡牌、市场与对话框的视觉样式。
- 加入英文地图标签、产业名称、控制提示、开局设置、规则说明及导览。
- 在前端渲染源中使用完整英文模板；保留原始游戏对象、动作数据与存档。
- 地图几何、城市坐标、地区与产业配置保持原样；JS 模块的显示文本已本地化。

## 必须知道的运行条件

**这是本地运行的界面，需要联网。不是独立离线游戏。**

原游戏的规则计算、合法行动与 AI 在 https://brass.iboardgame.app 的服务器上运行。
本版通过 `serve.py` 把原前端的请求发送到原游戏 API；没有复制或重写后端规则引擎。
原服务不可用或你的网络不能访问该域名时，可以看到本地界面，但不能开始或继续有效对局。
直接双击 `dist/index.html` 不能正确启动游戏，必须先运行本地服务器。

存档由原游戏前端保存在当前浏览器本地，也可以在 Settings 中导出和导入。导入的游戏存档会发送到原游戏服务供其恢复规则状态。
本地运行默认只监听本机，不提供公网地址。

## 已完成的验证

- `upstream/` 保留原始参考文件；当前前端本地化验证见 LOCALIZATION.md。
- JS 语法与 Python 编译检查通过。
- 本地 API 适配器连接原服务，成功测试：创建四人对局 → 执行合法建造 → 跳过动作及 AI 响应 → 导入存档恢复；恢复后得分、现金、收入一致。
- 在上述真实测试状态的文字数据中，英文翻译检查未发现剩余汉字。
- 浏览器已检查英文开局界面、地图标签和完整英文规则说明。
- 已完成真实浏览器整局验证，覆盖 AI、两个时代、通知与最终结算；未来上游新增消息会保留原文并记录诊断。

## 文件结构

| 路径 | 用途 |
|---|---|
| `serve.py` | 本地静态服务器与原游戏 API 适配器 |
| `dist/index.html` | 本版入口 |
| `dist/theme/atlas.css` | 全部新增的视觉样式 |
| `dist/theme/english.js` | 英文显示、英文规则与导览 |
| `dist/theme/geography.json` | 城市和地区英文对应表 |
| `dist/js/` | 前端程序，英文渲染模板已更新 |
| `dist/css/app.css` | 原版基础样式，未修改；由新增主题覆盖 |
| `dist/assets/` | 原地图几何、产业图片、头像与音乐 |
| `dist/fonts/` | 本地英文字体 |
| `upstream/` | 下载的原始文件备份 |
| `PROVENANCE.json` | 来源和原文件校验值 |
| `integration-checks.json` | 规则接口集成检查结果，不含游戏存档或会话凭据 |

## English notes

Run `python serve.py`, then open http://localhost:3000. Python 3 and an internet connection are required. No additional packages are needed.

This is a presentation reskin and English localization of the original client. The original online service still supplies rules and AI. Original map geometry and client modules are retained. This package has not been published or deployed.

Original game: https://iboardgame.app/en/play/brassworld

Visual reference: https://parallelsreading.com/
