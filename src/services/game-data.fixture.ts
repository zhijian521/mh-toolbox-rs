import quickItemsFile from '../../public/game/data/quick-items.json';
import schoolIconsFile from '../../public/game/data/school-icons.json';
import schoolsFile from '../../public/game/data/schools.json';
import skillsFile from '../../public/game/data/skills.json';
import { installGameData, type GameData } from './game-data';

/**
 * 测试用的**装配**：把真实的 `public/game/data/*.json` 装进 `game-data` 的缓存。
 *
 * 为什么要这么一层：`gameData()` 是同步读缓存的，而缓存平时由 `loadGameData()`
 * 在启动时 `fetch` 填。单测跑在 Node 里，没有 dev server 也没有 `fetch` 的目标，
 * 所以改由这里**直接读文件**（模块解析，不是 `node:fs`——`src/` 不该能拿 `node:fs`，
 * 见 `ghost-maps.test.ts` 头注释里那条理由）。
 *
 * 为什么是单独一个文件而不是每个测试各写一遍：路径字面量只能写一次。写六遍的话，
 * 换目录时按 IDE 的全局替换也许能改全，但**下一次换目录的人不会知道**有六处。
 * 这个文件被 import 的瞬间就把缓存填好，测试文件只需要一行副作用导入。
 *
 * 断言仍然读**真文件**：这些测试要证明的正是「仓库里那几张表对」，喂一份手搓的
 * 假清单只能证明假的对。
 */
const json = {
    schools: schoolsFile,
    skills: skillsFile,
    schoolIcons: schoolIconsFile,
    quickItems: quickItemsFile,
};

function seedGameData(): GameData {
    return installGameData(json.schools, json.skills, json.schoolIcons, json.quickItems);
}

/* 副作用：import 即就绪。刻意不放在 `beforeAll` 里——测试文件顶层的 `describe` 会
 * 在钩子之前展开，早一步填好缓存，断言里就不用再关心顺序。 */
seedGameData();
