# public/game/icons/ —— 游戏里的图标与图片

门派徽记、技能图标、头像、道具图标这类**游戏里能看到的小图**；界面图标在 `src/components/icons.ts`（tabler）。

## 结构：一个类目一个文件夹

```
icons/
├── skill/ skill-01..21.webp 21
├── story/ story-01..11.webp 11
├── active/ active-01..69.webp 69
├── school/ school-skill-<门派>-<n>.webp 147
├── gear/ gear-<部位>-<nn>.webp 83
├── weapon/ weapon-<种类>-<等级>.webp 231
├── item/ item-<id>.png|gif 59
├── lingshi/ ling-<部位>-<等级>.webp 20
├── yupo/ yupo-<yin|yang>.webp 2
├── pet-basic/ pet-basic-<ID>.png 68
├── pet-advanced/ pet-advanced-<ID>.png 52
├── pet-super/ pet-super-<ID>.png 48
├── pet-special/ pet-special-<ID>.png 185（含升星扩展 89）
└── pet-portrait/ pet-<编号>.png / portrait-<摘要>.png
```

两条规则：**根目录不许放图**，一个类目一个子目录；**文件名以目录名开头**（`skill/skill-01.webp`、`school/school-skill-datang-1.webp`）。两条都由 `src/services/game-icons.test.ts` 的「图标目录结构」断言盯着，丢在根下或一个目录住两个类目，`npm run check` 当场红——这批文件会一直长（2026-11-04 一天 268 → 390），规范见 `docs/GAME-ASSETS.md` §9。

| 目录       | 内容     | 数量 | 来源（客户端）                                         |
| ---------- | -------- | ---- | ------------------------------------------------------ |
| `skill/`   | 生活技能 | 21   | PNG，`icons.json` 的 `imports.skill`                   |
| `story/`   | 剧情技能 | 11   | PNG，`icons.json` 的 `imports.story`                   |
| `active/`  | 装备特技 | 69   | PNG，`icons.json` 的 `imports.active`                  |
| `school/`  | 门派技能 | 147  | PNG，21 门派 × 7 项，`school-icons.json`               |
| `gear/`    | 装备图标 | 83   | `item120`，7 部位 × 60~160，`gear-icons.json`          |
| `weapon/`  | 武器图标 | 231  | `item120`，21 组，`weapon-icons.json`                  |
| `lingshi/` | 灵饰图标 | 20   | `item120`，4 部位 × 60~140，`lingshi-icons.json`       |
| `item/`    | 速记物品 | 59   | 摆摊掉落物 38 有牌价 + 21 随行就市，`quick-items.json` |
| `yupo/`    | 玉魄图标 | 2    | `item120`，上古玉魄·阴 / ·阳，无清单                   |

**文件名口径**：`item/` 是 `quick-items.json` 的 **id** 不是序号，`gear/` 是**序号**且序号即等级升序（第 1 个 = 60 级），等级、`b`/`c`、乾/坤后缀见 `../data/README.md`。`yupo/` 两件的名字有三份（客户端「上古玉魄·阴」、装备格 key「玉魄·阴」、文件名 `yupo-yin`），靠 `character.ts` 的 `GEAR_SLOT_ICON` 对上、**不写清单**（两条记录，清单会成为第二份真源）。装备特效 18 项**没有图标**，师门法术（墨绿 45 个）**不收**。

**带不带底**：`gear/`（第 120 批）`weapon/`（第 121 批）`lingshi/`（第 116 批）`yupo/` 是 120×120 透明底；`school/` 那 147 张**一直带红棕卡片底**，第 139 批换成客户端原图后**照旧带底**——原图本就画在底板上；`skill/`（第 142 批）`story/` `active/` 自带的金 / 蓝 / 红底板同理。所以「下一张带底的都没有」是句错话（2026-11-07 更正）。`lingshi/` **只有 20 件不是 24**（第 116 批），`玄龙苍珀` 唯一没有大图、只能放大 `item50`，理由见 `../data/README.md`。**序号不是技能名**：`skill-01` 就是 `skills.ts` 的 `LIFE_SKILLS[0]`（强身术），`game-icons.test.ts` 断言**第 n 个图标的名字等于名字表第 n 项**；门派那批是**面板上下顺序**，与 `schools.json` 的 `skills` 不同，查图标**按名字**。

## 命名、尺寸、引用

新增图标：`<目录>/<类目>-<id>.webp`，多图标带子类与序号；id 与 `data/` 里一致，小写拼音或英文短词，中间用**半角连字符**（进 URL）。门派技能必须带子类 `school-skill-datang-1.webp`，写成 `school-datang-1` 会与「门派徽记 `school-datang.webp`」同族。

`.webp` 有损 `quality=92`（`skill/` `story/` `active/` 共 101 个合计 333KB，无损要 957KB；门派 147 个纹样更密、合计 474KB，第 139 批的原图）。边长 **96**，48px 显示够 2 倍屏。**`gear/` `weapon/` `lingshi/` `yupo/` 是 120×120 的例外**（`gear/` 第 120 批、`weapon/` 第 121 批）：从客户端大图归一到 120（最长边 108、居中），装备 83 张约 538KB、灵饰 20 张约 176KB。**本体铺满画布、不垫背景**（早先垫的米黄 `(230,196,155)` 套一圈黄边），**也不补成正方形**（门派技能本体 60×59，补那 1px 若填黑就成上下两条黑边、像被截断；`lingshi/` 例外：透明画布上居中）。同类目混着 88 和 96，基线不齐。

走运行时路径，不 `import`：

```ts
const url = `${import.meta.env.BASE_URL}game/icons/skill/skill-01.webp`;
```

**目录在代码里只写一次**：`src/services/game-icons.ts` 顶部每个类目一条常量（`SKILL_DIR` / `STORY_DIR` / `SCHOOL_DIR` / `ITEM_DIR`），`gearSlotIcon` 那族由调用方自带子目录。组件里不许拼路径——换目录要改十几处，漏掉那处只在运行到那张图时 404、页面不报。文件名写进 `data/*.json`，目录由常量拼。

## 切图踩坑（只留结论）

**图不对就换来源，不在图上修。** `lingshi/` `gear/` `weapon/` 换掉的是「一格只 94×94 且自带卡片底，放到 40px 就是一块米黄方片」；`school/`（第 139 批）换它是为拿**原生像素**，代价是**照旧带底**——147 对按 48px 管线实测拉普拉斯方差中位 2416 → **4123（+71%）**，146/147 更锐，唯一变差的是「弥勒山 / 慈悲为怀」（源 30×30，1282 → 1204，降 6%，`source` 记 `client30`）；`skill/`（第 142 批）21 对按 23px（`IconTile` 的 `--shot` 默认 23）实测 8024 → **10509（+31%）**，46px 档 3684 → 4064（+10%），21/21 更锐；`story/` `active/`（第 144 批）把最后 80 张也换了，教训是**没按名字找过**：拿已命名的截图图标作参考，对 42,664 张解码 PNG 做 40×40 中心区 MSE 匹配，11 + 69 项全命中（剧情 69–113、特技 78–2700，逐格复核 80/80 一致）。

**不抠底的理由**：图形与卡片底同色系，实测白衣 `(240,240,235)` 与卡片底 `(243,222,192)` 曼哈顿色差只 64，而卡片底自身渐变跨度就有 44——分不开；flood fill 加腐蚀的结局是女衣、项链那几页必出米色大洞（白色装备被当背景挖掉），比带底更难看。所以截图那几批**只裁切、不抠底**（内缩 2px → 裁 90×90 → 缩到 96）。三条硬规矩：**内缩不超过 2px**（内缩 4 会切掉卡片四角卷云暗纹的角、四瓣花缺一角，2026-11-05 返工踩到）；**底边不兜面板边界**（列表最底那行被面板下边缘切掉，图底带一条格子间隙、拼图时是一道横贯亮带；`has_band()` 拒收这种格子，只有这一份可用的 `weapon-mobang-160` 整体上移 2~8px 重取）；**不要改成「取内容包围盒再等比放大」**（2026-11-05 返工：图标被拉满到贴边像被裁掉，贴顶的还会把取景框顶到格子外、带进更亮的间隙；行定位用「内容投影 - 2px」也错，每页各偏 2~8px——现在**用格子间隙求相位**、取景固定内缩，`dy: -1` 试过没用）。

同类一处：最后六家（女魃墓、天机城、花果山、东海渊、九黎城、弥勒山）比前十五家高 1px，最底一行是「描边 + 米黄底」混成的半透明行，`body_bottom()` 判「跳变行比上一行亮就丢掉」（前十五家暗 10~23 级、这六家亮 7~50 级，差 17 级不会误判），结果各家 7 格一致（15 家 59 行、6 家 57 行）。这些如今只服务名字与顺序（`school/` 第 139 批整批覆写、`weapon/` 第 121 批）：`slice-*.py` 出 id / 名称 / 等级 / 顺序，`import-*-icons.py` 只覆写图片与 `source`，**永远先切后导**（反过来把图打回截图那版），重跑命令见 `docs/GAME-ASSETS.md` §4.2；九类里只剩 `item/` 是旧系统带过来的图。**`gear-icons.json` 没有测试盯着**（另两份有 `game-icons.test.ts` 比对名字），数量与顺序靠 `slice-gear.py` 的 `NAMES` 与裁出张数不一致即报错退出，装备页落地再补断言。

**召唤兽原图归档（2026-11-07）**：四个 `pet-*` 目录 353 张 PNG 保留原始 30/40/50px 与颜色、不缩放不转有损；名称与 SHA-256 见 `../data/pet-skills.json`，详见 `docs/GAME-ASSETS.md` §4.3。
