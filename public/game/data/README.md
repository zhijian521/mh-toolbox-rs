# public/game/data/ —— 游戏事实数据

**游戏更新时这批数据会变，代码不该跟着改**；表里写脚本名的由脚本生成、不手改。

| 文件                   | 内容                  | 谁维护                      |
| ---------------------- | --------------------- | --------------------------- |
| `icons.json`           | 生活/剧情/特技清单    | `slice.py`                  |
| `school-icons.json`    | 门派技能 147 张       | `slice-school.py`           |
| `gear-icons.json`      | 装备 83 张            | `import-slot-icons.py`      |
| `weapon-icons.json`    | 武器 231 张           | `import-slot-icons.py`      |
| `lingshi-icons.json`   | 灵饰 20 张            | `import-client-icons.py`    |
| `schools.json`         | 门派、技能、上限      | 手改                        |
| `skills.json`          | 生活 21、剧情 11      | 手改                        |
| `quick-items.json`     | 速记物品 59 件        | 手改；id 不改               |
| `pet-skills.json`      | 技能 ID 与 353 张 PNG | `import-pet-skill-icons.py` |
| `pet-portraits.json`   | 头像编号与物种        | `import-pet-portraits.mjs`  |
| `pet-panel.json`       | 属性、加点、标签      | 手改                        |
| `character-rules.json` | 属性、修炼、OCR 标签  | 手改（同改断言）            |
| `activities.json`      | 活动周期与时段        | 手改                        |
| `gameplay.json`        | 物价品类、抓鬼容差    | 手改                        |

五份 `*-icons.json` 同一套路：`slice-*.py` 定名字与顺序并出图，`import-*-icons.py` 只覆写 `img` 与 `source`（第 120 批起用客户端 `item120` 大图），**先切后导**；`img` 只写文件名（目录见 `../icons/README.md`），`id` 稳定。不能并成一份：谁后跑谁覆盖对方分组且不报错，`slice-weapon.py` 曾把「截图没覆盖最底那格」当成「没有 160 造型」，名字表各砍一条（第 121 批）——切到的档要覆盖名字表每一档，**少一档不报错，后面的档整体前移一格**。

## 逐表：字段与踩坑

- **`gear-icons.json`**：`groups` 七部位拼音，每项 `{id, img, name, level, source}`；**序号 = 等级升序**（60→160），五部位各 11 件、腰带饰品各 14 件（60/70/80 各两款），只覆盖 60 级以上（2026-11-04 确认）。坑：83 张与官网防具五页（`dj005.html` 及 `dj005_2~5`）131 张逐格比对定死（头盔第 1~10 连续命中 60/70/…/150，60 水晶帽 / 160 浑天玄火盔另复核）；`source` 混用 `item120`（120×120 大图）与 `shot`（96×96 带米黄卡片底），现全 `item120`。
- **`weapon-icons.json`**：分组键用中文种类名、文件名用英文 key、装备用拼音，**故意的**；21 组 = **231 件** = 19 种武器加双巨斧拆成的乾、坤两件（`骠城双戚（乾）/（坤）`，各 17 档 0~160、各 11 张、末档 160 是「非天」；官网写作一件「隳城双戚」，以客户端为准）；`level` 与 `level_hi` 在 60/70/80/150/160 相等，90 级起几款官网写 `90-150` 照实写，同区间多款用 `b`/`c` 后缀；名称等级抄 `dj004_2~19.html`。坑：前 15 种**靠位置不靠红线**（对齐 340 行序列求偏移，再取 `level >= 60`），后五种（巨剑 灯笼 伞 双巨斧 棍）写死 `LATE_PAGES`，起始档三样互校（红圈、选中框加详情、两页 3 格像素差为 0）；第 121 批全换 `item120`（231 条、120×120 透明），早先百科截图带卡片底、格子底更暗（`240,212,176` vs `248,228,184`）。
- **`lingshi-icons.json`**：`jiezhi`/`ershi`/`shouzhuo`/`peishi` 各 5 级（60/80/100/120/140），共 **20 件不是 24**，面板到 140 结束（第二张末行第三格空），官网另列的 160 级四件（太虚渺云 焰云霞珠 浮雪幻音 碧海青天）**这个客户端里没有**，只能自己画。坑：2026-11-05（第 116 批）换透明底后 `item120` 19 条、`item50` 一条（`玄龙苍珀`，唯一本地缺 `item120` 的一件，`missing-images.csv` 记着 21129 个找不到的图资源）——**两套画稿，不是同一张的小大版**，`item50` 在 40px 能看但别再放大。
- **`school-icons.json`**：只有 `groups.skill` 一组七项门派技能，面板中间那列**师门法术不收**（`schools.json` 无对应字段）；不并进 `icons.json`：两份由两个脚本生成（4×3 网格 vs 竖排 7 行固定坐标）。坑：**这是面板上下顺序**，与 `schools.json` 按重要度排的 `skills` 不同（大唐「十方无敌」面板第 1 位、表里第 5 位），查图标**按名字**。
- **`icons.json`**：**资源清单**不是实体表，序号不自解释，`game-icons.test.ts` 与 `skills.json` / `character-rules.json` 名字表逐项比对，错位直接红；结构 `{"generated-by": "…", "groups": {"skill": [{"id", "name"}]}}`。
- **`schools.json`**：`id` 拼音小写 `[a-z0-9-]` 稳定、`name` 是显示名。坑：`cap` 180 是**表级**一个数不是每项一份，分开放要改 147 处；`skills` 按重要度排。
- **`skills.json`**：`life` 21、`story` 11，只是**有序名录**，按名字查、图标按**下标**拼文件名（`skill-01` = 生活表第 1 项）。坑：中间插一项后面整体错位（`game-icons.test.ts` 会红，但红在「名字对不上」而非「顺序错了」）。
- **`quick-items.json`**：`fixed` `{id: 1, name: 60武器, file: item-1.png}` / `variable` `{id: 99, name: 金币, file: item-99.png}`。分开有游戏依据：`fixed` 有牌价（宝石、五宝）、点一下按参考单价入账，`variable` 随行就市（兽决 内丹 图册）、每条现填单价；「金币」（id 99）记金额本身、不乘单价。坑：`id` 稳定（1–40 / 99–200，中间有缺号），单价表按它存，改了等于清空所有人的单价；加物品用没出现过的号（旧习惯往后接 118、200）。
- **`pet-skills.json`**：低级 68、高级 52、超级 48、特殊 185 张，含藏宝阁常规名录 264 个技能 ID 与神兽升星扩展 89 项，尚未接入页面；`categories` 四类各有 `id`、`name`、`iconDir`（`../icons/pet-basic/` 等四个），`icons` 每项 `id`、`name`、`displayName`、`categoryId`、`subgroup`、`scope`、`img` 与 SHA-256，`displayName` 区分物理 / 法术与强化版（同名按 ID 区分）。坑：`missing` 留触类旁通（56150）与强化版（56196，官网 404、`img: null`）。
- **`pet-panel.json`** 记属性、加点、标签与别名；**`pet-portraits.json`** 记头像编号、物种、来源与缺项。图片见 `../icons/README.md`。

## 约定与来源

只写数据不写路径前缀（图片只写文件名、目录由常量拼，同 `maps.json` 的 `img`；一份清单配一个图标目录）；`id` 稳定唯一、显示名可改；不写界面文案（`tag`/`note` 属夹具或 UI 常量）；没量过的数值不写。新表用复数名（`items.json`），**不要做成一个大 `game.json`**。

`pet-skills.json` 取自 2026-11-07 的[藏宝阁技能配置](https://cbg-xyq.res.netease.com/js/game_auto_config.js)快照与 `C:/games/MHXY` 客户端：167 张用客户端 PNG、186 张由官网具名 GIF 无损转 PNG，逐项记 `provenance` 与 SHA-256；同批修正低级 / 高级反击与冥思对调（反击 302、冥思 310 蓝，高级反击 402、高级冥思 410 红），脚本固定这四张已核对图、旧素材被拒，重导用 `python tools/game-icons/import-pet-skill-icons.py --src <素材包目录>`（分类从 `C:/games/MHXY-icons/召唤兽技能专用包/manifest.json` 读，不猜前缀）。

加载只有一个（`services/game-data.ts`，`main.ts` 里 `await loadGameData()` 成功后才 `mount`），之后全站同步读缓存；组件不许 `fetch`、不加「表还没回来」的 `v-if`，失败保留上一份缓存。规则见 `docs/GAME-ASSETS.md` §6。
