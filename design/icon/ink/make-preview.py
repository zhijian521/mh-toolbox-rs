# -*- coding: utf-8 -*-
"""水墨四式的评审页（单文件，图片内联）。"""
import base64
import os

HERE = os.path.dirname(os.path.abspath(__file__))

DEFS = [
    ('ink1', '焦墨',
     '一个字，浓墨，一枚「耶」印，其余全是纸。最直接也最耐看：字要黑得下去，纸要亮得起来，中间那点朱红才站得住。',
     '24px 起清楚；16px 只剩一团墨。'),
    ('ink2', '界格',
     '毛笔围一圈界格，字在格内。古籍封面就是这个结构——不是画的框，是写出来的框，四边粗细不同，四角由竖笔封住。',
     '四个里唯一在 16px 仍看得出结构的。'),
    ('ink3', '印为记',
     '字退成淡墨，朱印成了主角。淡墨是浅色的满墨，不是把透明度调低——后者会把笔锋糊成一摊灰。',
     '24px 起清楚，印始终是那一点红。'),
    ('ink4', '题跋',
     '大字在上，右侧一行竖排小字「养老助手」，像落款。信息最多，也最像一幅完整的字。',
     '小字 16px 会消失，主字还在。'),
]


def b64(name):
    with open(os.path.join(HERE, 'png', name), 'rb') as f:
        return 'data:image/png;base64,' + base64.b64encode(f.read()).decode()


NUM = {'ink1': '一', 'ink2': '二', 'ink3': '三', 'ink4': '四'}

cards = []
for key, name, desc, small in DEFS:
    sizes = ''.join(
        f'<img src="{b64(f"{key}_{s}.png")}" style="width:{s}px;height:{s}px" alt="{s}">'
        for s in (48, 32, 24, 16))
    pin = '<span class="pin">定稿</span>' if key == 'ink1' else ''
    cards.append(f'''
    <article class="card">
      <div class="shot"><img class="big" src="{b64(f"{key}_256.png")}" alt="{name}"></div>
      <div class="meta"><span class="no">{NUM[key]}</span><h2>{name}</h2>{pin}</div>
      <p class="desc">{desc}</p>
      <div class="sizes">{sizes}</div>
      <p class="note">{small}</p>
    </article>''')

bar = ''.join(f'<img class="tb" src="{b64(f"{k}_32.png")}" alt="{n}">' for k, n, *_ in DEFS)
explorer = ''.join(f'''
      <li><img src="{b64(f"{k}_48.png")}" alt="{n}">
        <div><b>梦幻养老助手 · {n}</b><span>应用程序 · 1,842 KB</span></div></li>'''
                   for k, n, *_ in DEFS)

HTML = f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>应用图标 · 水墨四式</title>
<style>
@font-face {{
  font-family: 'LXGWWenKai';
  src: url('../../../assets/fonts/LXGWWenKaiScreen.woff2') format('woff2');
  font-display: swap;
}}
:root {{
  --bg: #efe9da; --paper: #f9f5eb; --paper2: #f3ecdd;
  --ink: #1e1a16; --ink2: #3f382f; --muted: #8a7d68;
  --rule: #ddd0b6; --rule2: #c3b191;
  --cinn: #962c25;
}}
* {{ box-sizing: border-box; }}
html {{ -webkit-font-smoothing: antialiased; }}
body {{
  margin: 0; background: var(--bg); color: var(--ink);
  font-family: 'LXGWWenKai', 'KaiTi', 'STKaiti', serif;
  font-size: 14.5px; line-height: 1.72;
}}
.wrap {{ max-width: 1260px; margin: 0 auto; padding: 54px 30px 76px; }}

header {{ padding-bottom: 26px; border-bottom: 1px solid var(--rule2); }}
.eyebrow {{ font-size: 11px; letter-spacing: .22em; color: var(--muted); margin: 0 0 12px; }}
h1 {{ font-size: 36px; line-height: 1.2; margin: 0 0 14px; font-weight: 400; letter-spacing: .14em; }}
.lede {{ margin: 0; max-width: 760px; color: var(--ink2); font-size: 14px; }}
.lede em {{ font-style: normal; color: var(--cinn); }}

.grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; margin-top: 38px; }}
.card {{ position: relative; background: var(--paper); border: 1px solid var(--rule2); padding: 15px 15px 13px; }}
.card::before {{ content: ''; position: absolute; inset: 4px; border: 1px solid var(--rule); pointer-events: none; }}
.shot {{ background: var(--paper2); padding: 6px; }}
img.big {{ width: 100%; height: auto; display: block; }}
.meta {{ display: flex; align-items: baseline; gap: 9px; margin: 13px 0 7px; }}
.no {{
  font-size: 15px; color: var(--cinn); line-height: 1;
  border: 1.5px solid var(--cinn); border-radius: 2px;
  width: 24px; height: 24px; display: inline-grid; place-items: center;
  transform: rotate(-3deg); flex: none;
}}
h2 {{ font-size: 16px; font-weight: 400; margin: 0; letter-spacing: .08em; }}
.desc {{ font-size: 12.5px; color: var(--ink2); margin: 0 0 12px; line-height: 1.74; }}
.sizes {{ display: flex; align-items: flex-end; gap: 10px; border-top: 1px solid var(--rule); padding-top: 11px; min-height: 48px; }}
.sizes img {{ display: block; }}
.pin {{
  margin-left: auto; font-size: 10px; letter-spacing: .18em; color: var(--cinn);
  border: 1px solid var(--cinn); border-radius: 2px; padding: 1px 6px 0;
  transform: rotate(-2deg); opacity: .9;
}}
.note {{ font-size: 11px; color: var(--muted); margin: 9px 0 0; line-height: 1.6; }}

section.env {{ margin-top: 46px; }}
h3 {{ font-size: 11px; letter-spacing: .2em; color: var(--muted); font-weight: 400; margin: 0 0 14px; }}
.taskbar {{
  background: #202020; border-radius: 4px; height: 52px;
  display: flex; align-items: center; gap: 14px; padding: 0 18px;
}}
.taskbar .sim {{ width: 32px; height: 32px; border-radius: 6px; opacity: .26; }}
.taskbar .tb {{ width: 32px; height: 32px; display: block; }}
.taskbar .sep {{ width: 1px; height: 22px; background: #ffffff26; margin: 0 6px; }}
.explorer {{ margin-top: 18px; background: #f7f6f4; border: 1px solid #e3e1dd; border-radius: 4px; padding: 10px 6px; }}
.explorer ul {{ list-style: none; margin: 0; padding: 0; }}
.explorer li {{ display: flex; align-items: center; gap: 12px; padding: 7px 12px; }}
.explorer li + li {{ border-top: 1px solid #eceae6; }}
.explorer b {{ display: block; font-family: 'Microsoft YaHei', system-ui, sans-serif; font-size: 12.5px; font-weight: 400; color: #1f1f1f; }}
.explorer span {{ display: block; font-family: 'Microsoft YaHei', system-ui, sans-serif; font-size: 11px; color: #6c6c6c; }}

footer {{ margin-top: 42px; border-top: 1px solid var(--rule2); padding-top: 20px; }}
footer p {{ margin: 0 0 9px; font-size: 13px; color: var(--ink2); }}
footer .dim {{ font-size: 11.5px; color: var(--muted); line-height: 1.8; }}
code {{ font-family: 'Cascadia Mono', Consolas, monospace; font-size: .92em; color: var(--cinn); }}
@media (max-width: 1080px) {{ .grid {{ grid-template-columns: repeat(2, 1fr); }} }}
@media (max-width: 560px) {{ .grid {{ grid-template-columns: 1fr; }} }}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <p class="eyebrow">梦幻养老助手 · 应用图标 · 第二稿</p>
    <h1>水墨四式</h1>
    <p class="lede">
      上一稿走的是账簿——方正、有格子、朱印压角，太规整了，不像纸上的东西。这一稿换成宣纸上的书与印：
      暖白纸、焦墨行楷、随形朱印，留白占三成以上。<em>四个方案的区别只在墨怎么用</em>：浓、格、淡、款。
      右下那枚印里刻的是「耶」——作者印，四个方案通用。全部按 2048px 超采样渲染，卡片下方小尺寸是真实像素。
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
      {bar}
    </div>
  </section>

  <section class="env">
    <h3>放在环境里 · 资源管理器 48px</h3>
    <div class="explorer"><ul>{explorer}</ul></div>
  </section>

  <footer>
    <p><b>第一式已落地</b>：<code>src-tauri/icons/</code> 全套 ico / png / icns 已替换，<code>tauri.conf.json</code> 的图标列表也已补齐。执行一次 <code>npm run desktop</code> 就能看到新图标出现在窗口和任务栏上。</p>
    <p class="dim">
      说明一句：山水、竹子这类「画」的方向我也试过——用字体笔画去拼山脊和竹叶，出来的是波浪线和箭头，纯代码生成撑不住。
      所以这四式都落在「书与印」上。真要山水，得找真实的水墨素材，那是另一条路，需要你给素材或我再想办法。
    </p>
    <p class="dim">源文件同目录：<code>ink-lab.py</code>（绘制脚本，笔触取自华文行楷的「一」「丨」）、<code>png/</code>（各尺寸成品）。</p>
  </footer>
</div>
</body>
</html>'''

out = os.path.join(HERE, 'preview.html')
open(out, 'w', encoding='utf-8').write(HTML)
print(out, len(HTML))
