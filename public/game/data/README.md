# public/game/data/ —— 游戏事实数据

「这个游戏里有什么」的表：门派、师门技能、辅助技能、装备、特技、宝石、道具。
判断标准很简单：**游戏更新时这批数据会变，而我们的代码不该跟着改**。

现在这个目录是空的。角色页上的门派与技能还住在 `src/views/characters/mock.ts`
——那是一份**演示数据**（为了把版式立起来的一个假角色），不是游戏事实表；
接真实数据时按下面的约定搬进来。

## 一个文件一类实体

```
schools.json   门派：id、名称、师徒关系、可用角色性别
skills.json    技能：id、名称、所属门派、等级上限、类型（师门/辅助/修炼）
gear.json      装备：id、名称、部位、等级段、特技、套装
items.json     道具
```

文件名用复数的实体名。不要做成一个大 `game.json`——一类实体一张表，改动时才看得出
「这次动的是哪一块」，diff 也不会和别的类目搅在一起。

## JSON 约定

1. **只写数据，不写路径前缀**。要引用图片就写文件名（`"icon": "school-datang.webp"`），
   目录由代码里的常量拼——与 `maps.json` 的 `img` 同一条规则。
2. **id 稳定且唯一**。它是代码里引用这条记录的唯一键；显示名可以改，id 不要改。
3. **不要把界面文案写进来**。`tag`、`note` 这类是人写的说明（见 `ghost-samples.ts`），
   属于测试夹具或 UI 常量，不属于游戏数据。
4. **不确定的字段宁可不写**。游戏里没验证过的数值（坐标域、等级上限）写进去就是一个
   日后没人敢删的假事实；等真的量过再补。

## 配套的 TS 接口必须写

JSON 没有类型。每加一张表，同时写一份 interface 与加载函数，放 `src/services/game-<类目>.ts`：

```ts
export interface School {
    id: string;
    name: string; /* … */
}

let cache: Promise<School[]> | null = null;

export function loadSchools(): Promise<School[]> {
    // fetch(`${import.meta.env.BASE_URL}game/data/schools.json`)
    // 失败返回 []，不把 reject 过的 promise 留在缓存里（理由同 ghost-maps.ts）
}
```

**不要在组件里直接 fetch**：加载、缓存、失败降级三件事各写一遍，迟早各有各的写法。

## 一个必须提前想清的问题

表是**异步加载**的。现在 `mock.ts` 是同步 import，页面组件拿到数据就能渲染；
换成 JSON 之后首帧必然是空的。落地的做法是「加载完之前显示上一次的数据 / 骨架」，
而不是给每个消费方加一个 `v-if` —— 后者会让「接真实数据」变成一次全页面改造。
