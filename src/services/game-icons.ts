/**
 * 技能图标：名字 → `public/game/icons/` 里的文件。
 *
 * **生活 / 剧情不读 `icons.json`**：那张清单是给测试与脚本用的（切图时生成），运行时
 * 再 fetch 一次只为查一个文件名，不划算。文件名按**顺序**编号（`skill-01` 就是生活技能
 * 表第 1 项），而名字表（`game/data/skills.json`）与清单一一对应——这条对应关系由
 * `game-icons.test.ts` 盯着，它一旦断了，测试先红，而不是界面上的图标张冠李戴
 * （纹样配错没人看得出来）。
 *
 * **门派技能反过来：必须读清单**（`game/data/school-icons.json`，已由 `game-data.ts`
 * 装进缓存）。它的文件名序号是切图时的面板顺序，与 `schools.json` 的 `skills` 顺序不同
 * （实测十方无敌 `-1`、为官之道 `-5`），推不出来，只能按名字查。
 *
 * 生活技能与剧情技能是两套图标（`skill-*` / `story-*`）：前者按等级练到 100+，
 * 后者按技能点学、最高 5 级。名字在两张表里不会重名，所以查的时候按类走。
 */
import { lifeSkills, schoolIcons, storySkills } from './game-data';

const ICON_DIR = `${import.meta.env.BASE_URL}game/icons/`;

/** 文件名两位序号，与切图脚本的命名一致（`skill-01` … `skill-21`）。 */
function iconUrl(prefix: 'skill' | 'story', index: number): string {
    return `${ICON_DIR}${prefix}-${String(index + 1).padStart(2, '0')}.webp`;
}

/** 生活技能图标。名字不在表里（用户自己敲的、或游戏新加的）返回 `undefined`——那时不画图，不留空槽。 */
export function lifeSkillIcon(name: string): string | undefined {
    const index = lifeSkills().indexOf(name);
    return index < 0 ? undefined : iconUrl('skill', index);
}

/** 剧情技能图标。*/
export function storySkillIcon(name: string): string | undefined {
    const index = storySkills().indexOf(name);
    return index < 0 ? undefined : iconUrl('story', index);
}

/** 按类取图标。卡片与编辑器都走这一个入口，免得两边各写一次三元。 */
export function assistIcon(name: string, kind: 'life' | 'story'): string | undefined {
    return kind === 'story' ? storySkillIcon(name) : lifeSkillIcon(name);
}

/**
 * 门派技能图标。名字不在清单里（老存档里手敲的、游戏新加的）返回 `undefined`——
 * 卡上那时退回「首字印」，不留一个破图。
 *
 * 按名字线性查：147 条、只在渲染七行时各调一次，不值得建索引。
 */
export function schoolSkillIcon(name: string): string | undefined {
    const entry = schoolIcons().find((item) => item.name === name);
    if (!entry) return undefined;
    return `${ICON_DIR}${entry.id}.webp`;
}
