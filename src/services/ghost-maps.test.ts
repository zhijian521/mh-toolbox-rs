import { describe, expect, it } from 'vitest';

/**
 * 地图清单与底图文件的一致性。
 *
 * 这个文件不是「测代码」，而是**把 `docs/GAME-ASSETS.md` 的规范变成断言**：
 * 清单与图片必须同目录、必须一一对应、`img` 只写文件名。
 *
 * 为什么值得单独写：这几条错的失败方式极隐蔽——加一条记录忘了放图，页面一切正常，
 * 只是走到那个场景时底图不显示；而 `img` 里手写了目录，换目录时只有**漏改的那一条**
 * 会 404，同样不报错。两者都不会让类型检查或别的测试变红，只能靠这里盯。
 *
 * 两个实现上的选择：
 *
 * 1. **用 `import.meta.glob` 而不是 `node:fs`**。`tsconfig` 的 `types` 只有
 *    `["vite/client"]`，这是有意的：`src/` 会进打包，组件里不该能 `import 'node:fs'`
 *    而不报错。为一条测试放开这个口子不划算。而且 glob 拿到的是**打包器眼里的文件集合**，
 *    比 fs 更贴近运行时——vite 看不见的文件，页面也拿不到。
 * 2. **只有一个路径字面量**。清单和底图都由同一个 glob 枚举，目录只写一次；
 *    `import mapsFile from '../../public/game/maps/maps.json'` 那种写法会把目录写第二遍。
 */
interface Entry {
    id: string;
    img: string;
}

const DIR = '/public/game/maps/';
const MODULES = import.meta.glob('/public/game/maps/*');

const jsonKey = Object.keys(MODULES).find((key) => key === `${DIR}maps.json`);
if (!jsonKey) {
    throw new Error(
        `public/game/maps/ 下没有 maps.json（glob 到 ${Object.keys(MODULES).length} 个文件）`,
    );
}

const { maps } = (await MODULES[jsonKey]()) as { maps: Entry[] };

/** 目录里实际存在的底图文件名。glob 的 key 是项目根起的完整路径，这里只留文件名。 */
const files = Object.keys(MODULES)
    .filter((key) => key.endsWith('.webp'))
    .map((key) => key.slice(DIR.length));

describe('地图清单', () => {
    it('img 只写文件名，不带目录', () => {
        const withPath = maps.filter((entry) => entry.img.includes('/')).map((entry) => entry.id);
        expect(
            withPath,
            `目录由 ghost-maps.ts 的 MAP_DIR 拼，清单里写路径就得每换一次目录改 ${maps.length} 处`,
        ).toEqual([]);
    });

    it('每条记录都有对应的底图文件', () => {
        const existing = new Set(files);
        const missing = maps
            .filter((entry) => !existing.has(entry.img))
            .map((entry) => `${entry.id} → ${entry.img}`);
        expect(missing, '清单里有、目录里没有：走到那个场景时底图静默不显示').toEqual([]);
    });

    it('目录里的每张 webp 都在清单里', () => {
        const listed = new Set(maps.map((entry) => entry.img));
        const orphans = files.filter((file) => !listed.has(file)).sort();
        expect(orphans, '目录里有、清单里没有：这张图永远不会被用到，白占体积').toEqual([]);
    });

    it('id 唯一', () => {
        const ids = maps.map((entry) => entry.id);
        expect(new Set(ids).size, 'id 是查找用的键，重复会让匹配命中第一条').toBe(ids.length);
    });
});
