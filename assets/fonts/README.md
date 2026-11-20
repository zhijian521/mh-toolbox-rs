# 随包字体

字体独立于主题与字号，默认使用原有霞鹜文楷 Screen。所有界面共用 `tokens.css` 的 `--font-ui`，浏览器只请求当前使用的随包字体。“系统默认”使用 `system-ui, sans-serif`，由操作系统选择界面字体和中文回退，不下载字体文件。随包子集覆盖 GB2312 全集、ASCII、中文标点与全角字符；其他字符交由系统字体回退。

| 界面名称 | 随包文件               | 来源版本                    | 原件与许可                                             |
| -------- | ---------------------- | --------------------------- | ------------------------------------------------------ |
| 霞鹜文楷 | LXGWWenKaiScreen.woff2 | 原有 Screen 字体            | 同目录 `.full.woff2`、`OFL.txt`                        |
| 资源圆体 | MHRounded.woff2        | Resource Han Rounded v0.990 | CyanoHao 官方 CN Regular、`ResourceHanRounded-OFL.txt` |
| 系统默认 | 无 | 当前操作系统 | 不随应用分发 |

圆体是为本应用生成的子集修改版，内部字体名为 MH Toolbox Rounded，不沿用上游保留名称。界面名称仅说明字体来源。随包字体的上游版权与 SIL OFL 1.1 许可保留在对应文本和字体元数据中，许可文本通过 Tauri 资源配置随安装包分发；系统字体不标记为应用随包 OFL 子集。旧黑体偏好 `sans` 在读取时映射为 `system`，无效或缺失值仍回到文楷。

生成原有文楷使用 `python tools/font/subset-font.py`。生成圆体使用 `python tools/font/import-ui-fonts.py`，依赖 `fonttools[woff]`；圆体 7z 包使用支持 7z 的 bsdtar（Windows 自带 `tar`）读取，保留 `--only rounded` 参数。脚本复用同一覆盖范围，固定上游版本、下载地址与原件 SHA256；原件缓存于忽略目录 `.runtime/font-sources`，无需把大份原件重复打包。升级字体时一并更新地址、校验值、许可和产物。

子集保留字距、连字与等宽数字（`kern` / `liga` / `tnum`），数字签继续使用 `tabular-nums`。
