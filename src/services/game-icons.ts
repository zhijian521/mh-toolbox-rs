/**
 * 技能图标：名字 → `public/game/icons/` 里的文件。
 *
 * **不读 `icons.json`**：那张清单是给测试与脚本用的（切图时生成），运行时再 fetch 一次
 * 只为查一个文件名，不划算。文件名按**顺序**编号（`skill-01` 就是生活技能表第 1 项），
 * 而名字表（`game/data/skills.json`）与清单一一对应——这条对应关系由
 * `game-icons.test.ts` 盯着，它一旦断了，测试先红，而不是界面上的图标张冠李戴
 * （纹样配错没人看得出来）。
 *
 * 生活技能与剧情技能是两套图标（`skill-*` / `story-*`）：前者按等级练到 100+，
 * 后者按技能点学、最高 5 级。名字在两张表里不会重名，所以查的时候按类走。
 */
import { lifeSkills, storySkills } from './game-data';

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
