# -*- coding: utf-8 -*-
"""把四个方案拼成一张可评审的预览页（图片全部内联，单文件可分发）。"""
import base64
import os

HERE = os.path.dirname(os.path.abspath(__file__))

DEFS = [
    ('A', '朱文印', '朱文印',
     '一枚朱红细边框的印，几乎占满整张纸。朱文印是中文印章里最克制的一种：只有线，没有色块。方框撑得住，靠的就是这条线。',
     '16px 仍是一枚完整的红框，四个里最稳。'),
    ('B', '墨字朱印', '墨字朱印',
     '撑满纸面的墨色「梦」，右下角落一枚小朱印。这是账本的落款排法：正文用墨，署名用印。字重、印轻，印只负责收口。',
     '16px 下小印退成一点朱红，字仍是字。'),
    ('C', '账页三柱', '账页三柱',
     '文武线框住一页账，三根柱子贴着墨色基线站起来，最高那根是朱红。账簿里最实在的一张图——收益是长出来的，不是画上去的。',
     '16px 下结构反而最清楚，缩得越小越像账页。'),
    ('D', '夜账', '夜账',
     '同一枚印换到深墨纸上：实心朱红，字反白。深色任务栏上最跳的一个，代价是浅色资源管理器里会显重。',
     '深底最醒目，浅底显重，适合你常驻暗色。'),
]


def b64(name):
    with open(os.path.join(HERE, 'png', name), 'rb') as f:
        return 'data:image/png;base64,' + base64.b64encode(f.read()).decode()


cards = []
for key, name, _, desc, small in DEFS:
    sizes = ''.join(
        f'<img src="{b64(f"{key}_{s}.png")}" style="width:{s}px;height:{s}px" alt="{s}">'
        for s in (48, 32, 24, 16))
    cards.append(f'''
    <article class="card">
      <div class="shot"><img class="big" src="{b64(f"{key}_256.png")}" alt="方案{key}"></div>
      <div class="meta">
        <span class="no">{key}</span><h2>{name}</h2>
      </div>
      <p class="desc">{desc}</p>
      <div class="sizes">{sizes}</div>
      <p class="note">{small}</p>
    </article>''')

# 环境模拟：深色任务栏 / 浅色资源管理器
bar_items = ''.join(
    f'<img class="tb" src="{b64(f"{k}_32.png")}" alt="{k}">' for k, *_ in DEFS)
explorer = ''.join(f'''
      <li><img src="{b64(f"{k}_48.png")}" alt="{k}">
        <div><b>梦幻养老助手（{k}）</b><span>应用程序 · 1,842 KB</span></div></li>'''
    for k, *_ in DEFS)

HTML = f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>应用图标 · 四方案</title>
<style>
@font-face {{
  font-family: 'LXGWWenKai';
  src: url('../../assets/fonts/LXGWWenKaiScreen.woff2') format('woff2');
  font-display: swap;
}}
:root {{
  --bg: #eee5cf; --paper: #f8f3e6; --paper2: #f2ead6;
  --ink: #292520; --ink2: #4a4238; --muted: #877b62;
  --rule: #dccdab; --rule2: #bca87c;
  --cinn: #a8322b; --cinnink: #8a2620; --ochre: #8a5a2b;
}}
* {{ box-sizing: border-box; }}
html {{ -webkit-font-smoothing: antialiased; }}
body {{
  margin: 0; background: var(--bg); color: var(--ink);
  font-family: 'LXGWWenKai', 'KaiTi', 'STKaiti', serif;
  font-size: 14.5px; line-height: 1.72;
}}
.wrap {{ max-width: 1260px; margin: 0 auto; padding: 52px 30px 72px; }}

header {{ border-bottom: 1px solid var(--rule2); padding-bottom: 26px; }}
.eyebrow {{
  font-size: 11px; letter-spacing: .22em; color: var(--muted);
  text-transform: none; margin: 0 0 10px;
}}
h1 {{ font-size: 34px; line-height: 1.25; margin: 0 0 12px; font-weight: 400; letter-spacing: .04em; }}
.lede {{ margin: 0; max-width: 720px; color: var(--ink2); font-size: 14px; }}

.grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; margin-top: 38px; }}
.card {{ position: relative; background: var(--paper); border: 1px solid var(--rule2); padding: 15px 15px 13px; }}
.card::before {{
  content: ''; position: absolute; inset: 4px;
  border: 1px solid var(--rule); pointer-events: none;
}}
.shot {{ background: var(--paper2); padding: 6px; }}
img.big {{ width: 100%; height: auto; display: block; }}
.meta {{ display: flex; align-items: baseline; gap: 8px; margin: 13px 0 7px; }}
.no {{
  font-size: 19px; color: var(--cinn); line-height: 1;
  border: 1.5px solid var(--cinn); border-radius: 2px;
  width: 26px; height: 26px; display: inline-grid; place-items: center;
  transform: rotate(-2.5deg); flex: none;
}}
h2 {{ font-size: 16px; font-weight: 400; margin: 0; letter-spacing: .05em; }}
.desc {{ font-size: 12.5px; color: var(--ink2); margin: 0 0 12px; line-height: 1.72; }}
.sizes {{
  display: flex; align-items: flex-end; gap: 10px;
  border-top: 1px solid var(--rule); padding-top: 11px; min-height: 48px;
}}
.sizes img {{ display: block; }}
.note {{ font-size: 11px; color: var(--muted); margin: 9px 0 0; line-height: 1.6; }}

section.env {{ margin-top: 46px; }}
h3 {{ font-size: 11px; letter-spacing: .2em; color: var(--muted); font-weight: 400; margin: 0 0 14px; }}
.taskbar {{
  background: #202020; border-radius: 4px 4px 0 0; height: 52px;
  display: flex; align-items: center; gap: 14px; padding: 0 18px;
}}
.taskbar .sim {{ width: 32px; height: 32px; border-radius: 6px; opacity: .28; }}
.taskbar .tb {{ width: 32px; height: 32px; display: block; }}
.taskbar .sep {{ width: 1px; height: 22px; background: #ffffff26; margin: 0 6px; }}
.desktop-strip {{
  background: #2b2a27; height: 46px; border-radius: 0 0 4px 4px;
  display: flex; align-items: center; gap: 10px; padding: 0 18px;
  font-size: 12px; color: #ffffff8c;
}}
.explorer {{
  margin-top: 18px; background: #f7f6f4; border: 1px solid #e3e1dd; border-radius: 4px;
  padding: 10px 6px;
}}
.explorer ul {{ list-style: none; margin: 0; padding: 0; }}
.explorer li {{ display: flex; align-items: center; gap: 12px; padding: 7px 12px; border-radius: 3px; }}
.explorer li + li {{ border-top: 1px solid #eceae6; }}
.explorer img {{ display: block; }}
.explorer b {{
  display: block; font-family: 'Microsoft YaHei', system-ui, sans-serif;
  font-size: 12.5px; font-weight: 400; color: #1f1f1f;
}}
.explorer span {{
  display: block; font-family: 'Microsoft YaHei', system-ui, sans-serif;
  font-size: 11px; color: #6c6c6c;
}}

footer {{ margin-top: 40px; border-top: 1px solid var(--rule2); padding-top: 20px; }}
footer p {{ margin: 0 0 8px; font-size: 13px; color: var(--ink2); }}
footer .dim {{ font-size: 11.5px; color: var(--muted); }}
@media (max-width: 1080px) {{ .grid {{ grid-template-columns: repeat(2, 1fr); }} }}
@media (max-width: 560px) {{ .grid {{ grid-template-columns: 1fr; }} }}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <p class="eyebrow">梦幻养老助手 · 应用图标</p>
    <h1>四个方向</h1>
    <p class="lede">
      四个方案都从同一套视觉语言里长出来：宣纸米白作底、墨作字、朱红作印，圆角归零，结构靠线。
      差异只在「这张脸该有多像账本」——一枚印、一幅字、一页账，或者它们的暗色版。
      全部按 2048px 超采样渲染后降采样，卡片下方小尺寸是真实像素，不是缩放预览。<br>
      只想听一句：要气质选 A，要字面辨识选 B，要「这是个记账工具」选 C。
    </p>
  </header>

  <div class="grid">{''.join(cards)}
  </div>

  <section class="env">
    <h3>放在环境里 · 深色任务栏 32px</h3>
    <div class="taskbar">
      <div class="sim" style="background:#fff"></div>
      <div class="sim" style="background:#0078d4"></div>
      <div class="sim" style="background:#e8a33d"></div>
      <div class="sep"></div>
      {bar_items}
    </div>
    <div class="desktop-strip">浅色任务栏上，米白底的三个会「化」一点，深墨底的那个最跳。</div>
  </section>

  <section class="env">
    <h3>放在环境里 · 资源管理器 48px</h3>
    <div class="explorer"><ul>{explorer}</ul></div>
  </section>

  <footer>
    <p>选一个编号，我按 <code>tauri icon</code> 生成全套 ico / png / icns，替换掉现在那个深蓝底金环。</p>
    <p class="dim">四个方向也能拆开混搭——比如把 A 的印压进 C 的账页，或者把 B 的字换成白文印。说方向就行。</p>
    <p class="dim">源文件在本目录：<code>icon-lab.py</code>（绘制脚本）、<code>png/</code>（各尺寸成品）、<code>icon-preview.html</code>（本页）。</p>
  </footer>
</div>
</body>
</html>'''

out = os.path.join(HERE, 'icon-preview.html')
with open(out, 'w', encoding='utf-8') as f:
    f.write(HTML)
print(out, len(HTML))
