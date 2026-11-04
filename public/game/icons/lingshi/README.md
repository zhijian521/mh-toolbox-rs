# public/game/icons/lingshi/ —— 灵饰图标（还没切）

**这个目录现在是空的**，但代码已经在用它：`src/views/characters/character.ts` 的
`GEAR_SLOT_ICON` 里写着

```
戒指 → lingshi/ling-01.png
耳饰 → lingshi/ling-06.png
配饰 → lingshi/ling-12.png
手镯 → lingshi/ling-17.png
```

图当时只落在草稿目录（`.runtime/gear-lab/assets/icons/`），没进 `public/`，所以装备卡上
那四格现在是**破图**。

补图时只要把文件放进本目录、文件名保持 `ling-01` / `ling-06` / `ling-12` / `ling-17`
就齐了，**不用改代码**。规则见上一级 `../README.md`：目录名是一级类目，文件名以它开头
（这一批的历史前缀是 `ling-`，代码已按此引用，别另起一套）。
