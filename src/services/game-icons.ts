/**
 * 游戏图标：名字 → `public/game/icons/<类目>/` 里的文件。
 *
 * ---- 目录按**类目**分，一个类目一个文件夹 ----
 *
 * `skill/` 生活、`story/` 剧情、`active/` 装备特技、`school/` 门派技能、`gear/` 装备、
 * `weapon/` 武器、`item/` 速记物品。规则与理由写在 `docs/GAME-ASSETS.md` §2、§4，
 * 这里只记一条**代码侧**的后果：**每个类目一条目录常量，谁也不许拼字符串**。
 *
 * 早先图标全平铺在 `icons/` 根下（249 个），加一批就要在根目录里数前缀。分目录之后
 * 「这张图是什么」由路径回答，而不再靠文件名猜；`game-icons.test.ts` 有一条断言盯着
 * 「根目录不许有图、一个目录只装一个类目」——它可以红，规范才算数。
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

/** 图标的根。只有 `gearSlotIcon` 用它——那一族调用方自带子目录（见该函数）。 */
const ICON_ROOT = `${import.meta.env.BASE_URL}game/icons/`;

const SKILL_DIR = `${ICON_ROOT}skill/`;
const STORY_DIR = `${ICON_ROOT}story/`;
const SCHOOL_DIR = `${ICON_ROOT}school/`;
const ITEM_DIR = `${ICON_ROOT}item/`;

/**
 * 速记物品图标：文件名写在 `game/data/quick-items.json` 里，这里只拼目录。
 *
 * 不像技能图标那样按下标拼——物品的 id 是旧系统沿用的稳定编号（1–40 / 99–200），
 * 中间有缺号，拿它推文件名会在缺号处错位。文件名跟着清单走，加物品只改 JSON 与图。
 */
export function quickItemIcon(file: string): string {
    return `${ITEM_DIR}${file}`;
}

/** 文件名两位序号，与切图脚本的命名一致（`skill-01` … `skill-21`）。 */
function iconUrl(dir: string, prefix: 'skill' | 'story', index: number): string {
    return `${dir}${prefix}-${String(index + 1).padStart(2, '0')}.webp`;
}

/** 生活技能图标。名字不在表里（用户自己敲的、或游戏新加的）返回 `undefined`——那时不画图，不留空槽。 */
export function lifeSkillIcon(name: string): string | undefined {
    const index = lifeSkills().indexOf(name);
    return index < 0 ? undefined : iconUrl(SKILL_DIR, 'skill', index);
}

/** 剧情技能图标。*/
export function storySkillIcon(name: string): string | undefined {
    const index = storySkills().indexOf(name);
    return index < 0 ? undefined : iconUrl(STORY_DIR, 'story', index);
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
    return `${SCHOOL_DIR}${entry.id}.webp`;
}

/**
 * 装备格的示意图。
 *
 * `file` 是 `views/characters/character.ts` 的 `GEAR_SLOT_ICON` 里那条相对路径
 * （`gear/…` 或 `lingshi/…`），根目录只在这里拼——与三套技能图标同一条约定：
 * 图片放在哪由 services 说了算，哪一格配哪张图是业务，住在 views 里。
 *
 * **这一族调用方自带子目录**（`gear/`、`weapon/`、`lingshi/` 各一组），与上面几个
 * 「函数里定死一个目录」的不同：那一格配的是哪一类图，本身就是业务选择（头上戴的
 * 是装备、手上拿的是武器），不该让 services 再维护一张「部位 → 类目」的表。
 *
 * 与技能图标不同，这里**不做「查不到返回 undefined」**：调用方传的就是写死的表，
 * 查不到只可能是表里写了不存在的文件，那种错该在界面上露出来（破图），
 * 而不是静默退回空块——退回空块会让人以为「这件装备没有图」。
 */
export function gearSlotIcon(file: string): string {
    return `${ICON_ROOT}${file}`;
}
