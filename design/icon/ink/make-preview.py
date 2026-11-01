# -*- coding: utf-8 -*-
"""定稿说明页：暗色拓片版 + 圆角。单文件内联图片。"""
import base64
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def b64(path, name=None):
    with open(path, 'rb') as f:
        return 'data:image/png;base64,' + base64.b64encode(f.read()).decode()


def ic(name):
    return b64(os.path.join(HERE, 'png', name))


big = b64(os.path.join(HERE, 'mh-icon-1024.png'))

sizes = ''.join(
    f'<img src="{ic(f"ink1_{s}.png")}" style="width:{s}px;height:{s}px" alt="{s}">'
    for s in (128, 64, 48, 32, 24, 16))

HTML = f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>应用图标 · 拓片（定稿）</title>
<style>
@font-face {{
  font-family: 'LXGWWenKai';
  src: url('../../../assets/fonts/LXGWWenKaiScreen.woff2') format('woff2');
  font-display: swap;
}}
:root {{
  --bg: #efe9da; --paper: #f9f5eb; --paper2: #f3ecdd;
  --ink: #1e1a16; --ink2: #3f382f; --muted: #8a7d68;
  --rule: #ddd0b6; --rule2: #c3b191; --cinn: #962c25;
}}
* {{ box-sizing: border-box; }}
html {{ -webkit-font-smoothing: antialiased; }}
body {{
  margin: 0; background: var(--bg); color: var(--ink);
  font-family: 'LXGWWenKai', 'KaiTi', 'STKaiti', serif;
  font-size: 14.5px; line-height: 1.75;
}}
.wrap {{ max-width: 1120px; margin: 0 auto; padding: 52px 30px 72px; }}
header {{ padding-bottom: 24px; border-bottom: 1px solid var(--rule2); }}
.eyebrow {{ font-size: 11px; letter-spacing: .22em; color: var(--muted); margin: 0 0 12px; }}
h1 {{ font-size: 36px; line-height: 1.2; margin: 0 0 14px; font-weight: 400; letter-spacing: .16em; }}
.lede {{ margin: 0; max-width: 720px; color: var(--ink2); font-size: 14px; }}
.lede em {{ font-style: normal; color: var(--cinn); }}

.stage {{ display: grid; grid-template-columns: 420px 1fr; gap: 40px; margin-top: 40px; align-items: start; }}
.hero {{ background: var(--paper2); border: 1px solid var(--rule2); padding: 18px; }}
.hero img {{ width: 100%; display: block; }}

dl {{ margin: 0; }}
dt {{ font-size: 11px; letter-spacing: .18em; color: var(--muted); margin: 0 0 4px; }}
dd {{ margin: 0 0 18px; font-size: 13.5px; color: var(--ink2); }}
dd b {{ color: var(--ink); font-weight: 400; }}
.swatch {{ display: inline-block; width: 11px; height: 11px; border: 1px solid #00000022;
  vertical-align: -1px; margin-right: 5px; }}

h3 {{ font-size: 11px; letter-spacing: .2em; color: var(--muted); font-weight: 400; margin: 40px 0 14px; }}
.sizerow {{ display: flex; align-items: flex-end; gap: 18px; border-top: 1px solid var(--rule2);
  border-bottom: 1px solid var(--rule2); padding: 16px 0; }}
.sizerow img {{ display: block; }}

.envs {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }}
.env {{ border: 1px solid var(--rule2); overflow: hidden; }}
.env .body {{ height: 110px; display: flex; align-items: center; justify-content: center; gap: 14px; }}
.env .cap {{ font-size: 11px; color: var(--muted); padding: 7px 10px; border-top: 1px solid var(--rule2);
  background: var(--paper); letter-spacing: .1em; }}


footer {{ margin-top: 44px; border-top: 1px solid var(--rule2); padding-top: 20px; }}
footer p {{ margin: 0 0 9px; font-size: 13px; color: var(--ink2); }}
footer .dim {{ font-size: 11.5px; color: var(--muted); line-height: 1.85; }}
code {{ font-family: 'Cascadia Mono', Consolas, monospace; font-size: .92em; color: var(--cinn); }}
@media (max-width: 900px) {{ .stage {{ grid-template-columns: 1fr; }} .envs {{ grid-template-columns: 1fr; }} }}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <p class="eyebrow">梦幻养老助手 · 应用图标 · 定稿</p>
    <h1>拓片</h1>
    <p class="lede">
      把纸和墨换过来：<em>墨作底、纸作字</em>，就是碑拓的读法——碑上的字是凹下去的，拓的时候不沾墨，留在纸上就是白的。
      朱印盖在拓片上，是唯一的那点红。圆角从 3% 提到 18%，是 Windows 11 那一档。
    </p>
  </header>

  <div class="stage">
    <div class="hero"><img src="{big}" alt="定稿图标"></div>
    <dl>
      <dt>底色</dt>
      <dd><span class="swatch" style="background:#26211b"></span><b>#26211B</b> 墨底，比 <code>#202020</code> 的任务栏亮一档。
        再暗下去，深色任务栏上就只剩一片字浮着，看不出是个圆角方块。</dd>

      <dt>字</dt>
      <dd><span class="swatch" style="background:#f3ecdb"></span><b>#F3ECDB</b> 拓片留白。行楷「梦」，去掉了亮色版那圈外渗——
        暗底上的外渗会变成发光，假的。</dd>

      <dt>印</dt>
      <dd><span class="swatch" style="background:#bc4032"></span><b>#BC4032</b> 暗底上的朱要提亮、边框从 7.8% 加粗到 9%，
        否则在墨底上撑不住。</dd>

      <dt>立体</dt>
      <dd>底部压深一档（深墨渐变）+ 一层低频墨不匀。不是为了做 3D，
        是为了让这块色在有光的桌面上不变成一张死板。</dd>
    </dl>
  </div>

  <h3>尺寸</h3>
  <div class="sizerow">{sizes}</div>

  <h3>放在环境里</h3>
  <div class="envs">
    <div class="env">
      <div class="body" style="background:#ffffff">
        <img src="{ic('ink1_48.png')}" style="width:48px;height:48px">
        <img src="{ic('ink1_32.png')}" style="width:32px;height:32px">
      </div><div class="cap">白色桌面</div>
    </div>
    <div class="env">
      <div class="body" style="background:#ececea">
        <img src="{ic('ink1_48.png')}" style="width:48px;height:48px">
        <img src="{ic('ink1_32.png')}" style="width:32px;height:32px">
      </div><div class="cap">浅色资源管理器</div>
    </div>
    <div class="env">
      <div class="body" style="background:#202020">
        <img src="{ic('ink1_48.png')}" style="width:48px;height:48px">
        <img src="{ic('ink1_32.png')}" style="width:32px;height:32px">
      </div><div class="cap">深色任务栏</div>
    </div>
  </div>

  <footer>
    <p><b>已落地</b>：<code>src-tauri/icons/</code> 全套 ico / png / icns 已替换（ico 含 16/24/32/48/64/256），
      <code>tauri.conf.json</code> 的图标列表也已补齐。</p>
    <p class="dim">
      修掉一个旧 bug：渐变层会溢出到圆角外的透明区，导致四角残留半透明深色（实测 alpha 35–77），
      在浅色桌面上是一圈脏边。现在统一裁到圆角形状，四角 alpha 归零。
    </p>
    <p class="dim">
      小尺寸的实情：16px 下「梦」糊成一团，印章只剩一个 2px 红点；24px 起可辨，32px 清楚。
      任务栏是 24–32px，够用。要 16px 也清楚，只能换粗笔画字体，代价是丢掉笔意。
    </p>
  </footer>
</div>
</body>
</html>'''

out = os.path.join(HERE, 'preview.html')
open(out, 'w', encoding='utf-8').write(HTML)
print(out, len(HTML))
