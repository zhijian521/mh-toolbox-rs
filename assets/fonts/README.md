# 随包字体

字体独立于主题与字号，默认使用原有霞鹜文楷 Screen。所有界面共用 `tokens.css` 的 `--font-ui`，浏览器只请求当前使用的字体。子集覆盖 GB2312 全集、ASCII、中文标点与全角字符；其他字符交由系统字体回退。

| 界面名称 | 随包文件               | 来源版本                    | 原件与许可                                             |
| -------- | ---------------------- | --------------------------- | ------------------------------------------------------ |
| 霞鹜文楷 | LXGWWenKaiScreen.woff2 | 原有 Screen 字体            | 同目录 `.full.woff2`、`OFL.txt`                        |
| 思源黑体 | MHHei.woff2            | Source Han Sans 2.005       | Adobe 官方 CN Regular、`SourceHanSans-OFL.txt`         |
| 思源宋体 | MHSong.woff2           | Source Han Serif 2.003      | Adobe 官方 CN Regular、`SourceHanSerif-OFL.txt`        |
| 朱雀仿宋 | MHFangsong.woff2       | Zhuque Fangsong v0.212      | TrionesType 官方发布、`ZhuqueFangsong-OFL.txt`         |
| 资源圆体 | MHRounded.woff2        | Resource Han Rounded v0.990 | CyanoHao 官方 CN Regular、`ResourceHanRounded-OFL.txt` |

新增字体是为本应用生成的子集修改版，内部字体名为 MH Toolbox Hei / Song / Fangsong / Rounded；不沿用思源的保留名称。界面名称仅说明字体来源。上游版权与 SIL OFL 1.1 许可保留在对应文本和字体元数据中，全部许可文本通过 Tauri 资源配置随安装包分发。

生成原有文楷使用 `python tools/font/subset-font.py`。生成其他字体使用 `python tools/font/import-ui-fonts.py`，依赖 `fonttools[woff]`；圆体 7z 包使用支持 7z 的 bsdtar（Windows 自带 `tar`）读取。可用 `--only rounded` 只生成圆体。脚本复用同一覆盖范围，固定上游版本、下载地址与原件 SHA256；原件缓存于忽略目录 `.runtime/font-sources`，无需把大份 OTF 重复打包。升级字体时一并更新地址、校验值、许可和产物。

朱雀仿宋在界面上轻描 `0.012em` 字廓，补足小字号下的细笔画；只随仿宋选择生效，不改变字宽、行高和原字体资源。

子集保留字距、连字与等宽数字（`kern` / `liga` / `tnum`），保证 `.num` 的 `tabular-nums` 在朱雀仿宋中可用。
