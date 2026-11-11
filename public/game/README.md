# public/game/ —— 游戏资源的唯一目录

**凡是「梦幻西游本身长什么样、有什么东西」的图片、图标、数据都放这里，别放进 `src/`。** 判据、命名与替换流程的完整版在 `docs/GAME-ASSETS.md`，这里只写「往哪放、怎么换」。

```
public/game/
├── maps/   地图底图 + 清单（20 张 webp + maps.json）
├── icons/  游戏内图标，一个类目一个子目录（skill/ story/ active/ school/ gear/ item/ …）
└── data/   游戏事实数据（门派、技能、装备、道具的 JSON + 各批图标的清单）
```

**为什么是 `public/`**：Vite 给 `src/` 的资源改名加哈希，而清单写的是文件名、换完还得对得上；`public/` 原样拷进产物、文件名不变，代价是没打包器优化与 `import` 类型检查，对「随版本整批换」的图划算（论证见 `docs/GAME-ASSETS.md` §3.1）。

## 替换一张底图

1. 覆盖 `maps/` 里同名的 `.webp`（尺寸、比例与原图一致，否则坐标换算会整体偏移）；
2. 刷新页面，清单没变就不用动 `maps.json`。

## 加一张新地图

1. 切好图，文件名用场景的拼音（`xiliangnvgou.webp`），与 `maps.json` 的 `id` 一致；
2. 在 `maps.json` 的 `maps` 数组里加一条：

```json
{
    "id": "xiliangnvgou",
    "name": "西梁女国",
    "aliases": [],
    "maxX": 200,
    "maxY": 150,
    "img": "xiliangnvgou.webp"
}
```

3. `img` **只写文件名**——目录由 `src/services/ghost-maps.ts` 的 `MAP_DIR` 拼，换目录只改那一行；
4. `maxX` / `maxY` 是该场景坐标域的上限（游戏里走一遍四角读出来的），写错会让「越界贴边」判错；
5. 跑 `npm run check`——测试读这份清单，缺图或格式错当场失败。

## 不要放在这里

角色属性、修炼、装备部位、特技特效、蓝字、强化系数及 OCR 标签在 `data/character-rules.json`，活动日程在 `data/activities.json`，物价品类与抓鬼范围参数在 `data/gameplay.json`。生产代码统一经 `services/game-data.ts` 加载，先校验整套资源再读名册与物价；改规则后重开应用或刷新页面，并同步更新对应逻辑断言。

| 东西                             | 正确的家                     | 为什么                                                               |
| -------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| OCR 模型与字典（PP-OCRv4，16MB） | `src-tauri/models/`          | 识别引擎的通用模型，与游戏版本无关；且要走 Tauri 的 `resources` 打包 |
| 字体、印章、应用图标             | `assets/`                    | 品牌资产，不随游戏更新                                               |
| 测试用例、演示角色数据           | 跟着用它的页面（`views/*/`） | 「为了立版式 / 跑单测」的夹具，不是游戏事实                          |

`icons/` `data/` 的细则见同目录的 `icons/README.md`、`data/README.md`；跨目录判据（什么算游戏资源、命名、哪些耦合点故意没搬进来）只在 `docs/GAME-ASSETS.md`。
