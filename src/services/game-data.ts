/**
 * 游戏事实表：**门派（含七项门派技能）**、**技能名录（生活 / 剧情）**、
 * **门派技能图标清单**。
 *
 * 数据和代码分开，就一件事：游戏改版时**换文件，不改代码**。所以几张表住在
 * `public/game/data/`（Vite 原样拷贝、文件名稳定），这里只负责「取回来、校验形状、
 * 存一份」。规则本身在 `docs/GAME-ASSETS.md`，判断某段东西该不该搬进去之前先读那一份。
 *
 * ---- 为什么只有这一处是异步的 ----
 * 表是 JSON，只能 fetch。**加载只在启动时做一次**（`main.ts` 里 `loadGameData()` 之后才
 * `mount`），之后全站都用同步的 `gameData()` 读缓存——于是 `schoolSkills()`、图标查表、
 * 卡片的渲染全是同步纯函数，单测不必改成 async。
 *
 * 反面做法是「每个消费方各自 `await` + 各自 `v-if`」：六个页面各写一遍加载中状态，
 * 而且每处都要处理失败。那才是把异步漏进 UI 的办法。
 *
 * ---- 失败不崩 ----
 * 取不回来就退回空表：门下拉没有选项、辅助技能查不到图标，但应用照常起来
 * （`GAME-ASSETS.md` §1 第 3 条）。空表不写进缓存，下一次调用还能重试——
 * 与 `ghost-maps.ts` 同一个理由：dev server 抖一下不该把「没有数据」钉死一整晚。
 */

/** `public/game/data/` 下的目录。**换目录只改这一行**。 */
const DATA_DIR = `${import.meta.env.BASE_URL}game/data/`;

/**
 * 一个门派。
 *
 * `id` 稳定、`name` 会改（游戏改译名时只动 JSON），`skills` 是那七项的**名字**，
 * 顺序与游戏面板一致——卡片与编辑器都按这个顺序排。
 */
export interface SchoolEntry {
    id: string;
    name: string;
    /** 门派技能名，顺序即游戏面板的顺序。 */
    skills: string[];
}

export interface SchoolTable {
    /** 门派技能的等级上限。全部一样，所以是表级的一个数，不是每项一份。 */
    cap: number;
    schools: SchoolEntry[];
}

export interface SkillTable {
    /** 生活技能，顺序照游戏「生活技能」目录页（图标序号也按它）。 */
    life: string[];
    /** 剧情技能，同上。 */
    story: string[];
}

/**
 * 一张门派技能图标：`id` 就是文件名（`school-skill-datang-5`），`name` 是技能名，
 * `school` 是门派 id。
 *
 * **为什么不和生活 / 剧情一样按下标拼文件名**：那两套图的序号就是名字表的序号，
 * 而门派技能的文件序号是**切图时的面板顺序**，与 `schools.json` 里 `skills` 的顺序不同
 * （2026-11-04 实测：十方无敌是 `-1`、为官之道是 `-5`）。序号推不出来，只能按名字查——
 * 名字在 147 项里唯一，这条由 `game-icons.test.ts` 盯着。
 */
export interface SchoolIconEntry {
    id: string;
    name: string;
    school: string;
}

export interface GameData {
    schools: SchoolTable;
    skills: SkillTable;
    /** 门派技能图标清单（21 家 × 7）。表没加载上时是空数组。 */
    schoolIcons: SchoolIconEntry[];
}

/* 空表的 `cap` 写 0 而不是 180：它是「表没加载上」的占位，不是游戏事实。
 * `cap` 现在不上屏（2026-11-03 用户：「180 大家默认都知道」），但怎么算满级还读它。 */
const EMPTY: GameData = {
    schools: { cap: 0, schools: [] },
    skills: { life: [], story: [] },
    schoolIcons: [],
};

let current: GameData = EMPTY;

/** 同步读缓存。启动之后到处都能用；`main.ts` 保证它在第一次渲染前已经填好。 */
export function gameData(): GameData {
    return current;
}

/* ---------- 校验 ----------
 * 只查**形状**，不查业务（「每家七个技能」那种由测试盯）：游戏真加了第八项时，
 * 校验器不该拦住它——拦住等于「改文件不改代码」这条失效，得先改代码才能用新数据。
 * 报错带上文件与序号，缺页时能直接定位到是哪一条。
 */
function parseStringArray(raw: unknown, where: string): string[] {
    if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string' || !item.trim())) {
        throw new TypeError(`${where} 应为非空字符串数组`);
    }
    return raw as string[];
}

export function parseSchoolTable(raw: unknown): SchoolTable {
    const file = raw as { cap?: unknown; schools?: unknown };
    if (typeof file?.cap !== 'number' || file.cap <= 0) {
        throw new TypeError('schools.json：cap 应为正数');
    }
    if (!Array.isArray(file.schools) || !file.schools.length) {
        throw new TypeError('schools.json：schools 应为非空数组');
    }

    const schools = file.schools.map((item, index) => {
        const entry = item as Partial<SchoolEntry>;
        if (typeof entry?.id !== 'string' || !entry.id.trim()) {
            throw new TypeError(`schools.json：第 ${index + 1} 个门派缺 id`);
        }
        if (typeof entry.name !== 'string' || !entry.name.trim()) {
            throw new TypeError(`schools.json：第 ${index + 1} 个门派缺 name`);
        }
        return {
            id: entry.id,
            name: entry.name,
            skills: parseStringArray(entry.skills, `schools.json：${entry.name} 的 skills`),
        };
    });

    return { cap: file.cap, schools };
}

export function parseSkillTable(raw: unknown): SkillTable {
    const file = raw as { life?: unknown; story?: unknown };
    return {
        life: parseStringArray(file?.life, 'skills.json：life'),
        story: parseStringArray(file?.story, 'skills.json：story'),
    };
}

/**
 * `school-icons.json` 的形状是 `{ "groups": { "skill": [...] } }`——与 `icons.json`
 * 同一套外壳（切图脚本两个产物共用一个格式）。**只取 `skill` 组**：门派徽记
 * （`school-datang.webp` 那一族）现在还没入库，将来有了是另一个组，读法一样。
 *
 * 名字重复会让「按名字查图标」查错门派，所以这里**当场拦下**，而不是留给测试。
 * 校验器只在启动时跑一次，代价可以忽略；而一旦放进缓存，错的那张图会一直显示。
 */
export function parseSchoolIconTable(raw: unknown): SchoolIconEntry[] {
    const groups = (raw as { groups?: Record<string, unknown> })?.groups;
    const list = groups?.skill;
    if (!Array.isArray(list)) {
        throw new TypeError('school-icons.json：groups.skill 应为数组');
    }

    const seen = new Set<string>();
    return list.map((item, index) => {
        const entry = item as Partial<SchoolIconEntry>;
        for (const field of ['id', 'name', 'school'] as const) {
            if (typeof entry?.[field] !== 'string' || !entry[field]?.trim()) {
                throw new TypeError(`school-icons.json：第 ${index + 1} 项缺 ${field}`);
            }
        }
        const name = entry.name as string;
        if (seen.has(name)) {
            throw new TypeError(`school-icons.json：技能名重复（${name}），按名字查会查到别人家`);
        }
        seen.add(name);
        return { id: entry.id as string, name, school: entry.school as string };
    });
}

/** 把三份原始 JSON 装进缓存。启动时由 `loadGameData()` 调，测试里直接用文件内容调。 */
export function installGameData(
    schoolsRaw: unknown,
    skillsRaw: unknown,
    schoolIconsRaw: unknown,
): GameData {
    current = {
        schools: parseSchoolTable(schoolsRaw),
        skills: parseSkillTable(skillsRaw),
        schoolIcons: parseSchoolIconTable(schoolIconsRaw),
    };
    return current;
}

async function fetchJson(file: string): Promise<unknown> {
    const response = await fetch(`${DATA_DIR}${file}`);
    if (!response.ok) throw new Error(`${file} ${response.status}`);
    return response.json();
}

let pending: Promise<GameData> | null = null;

/**
 * 启动时加载一次。三份表并行取，装进缓存后返回；失败退回空表并**清掉 promise**，
 * 下一次调用会重试。
 *
 * 调用点是 `main.ts`：它 `await` 完这个才 `mount`，所以全站拿到的都是「加载完再渲染」，
 * 不需要任何组件自带加载态。
 */
export function loadGameData(): Promise<GameData> {
    if (!pending) {
        pending = Promise.all([
            fetchJson('schools.json'),
            fetchJson('skills.json'),
            fetchJson('school-icons.json'),
        ])
            .then(([schools, skills, schoolIcons]) => installGameData(schools, skills, schoolIcons))
            .catch((error: unknown) => {
                console.error('游戏数据表加载失败', error);
                pending = null;
                current = EMPTY;
                return current;
            });
    }
    return pending;
}

/* ---------- 消费方用的几个读法 ----------
 * 直接暴露数组（不复制）：这些表在运行期不会被改，每帧复制一次纯属浪费——
 * 图标查表是逐格调用的。要改数据请改 JSON。 */
export function schoolNames(): string[] {
    return current.schools.schools.map((school) => school.name);
}

export function schoolSkillCap(): number {
    return current.schools.cap;
}

export function lifeSkills(): string[] {
    return current.skills.life;
}

export function storySkills(): string[] {
    return current.skills.story;
}

/** 门派技能图标清单。查图标请走 `services/game-icons.ts` 的 `schoolSkillIcon()`。 */
export function schoolIcons(): SchoolIconEntry[] {
    return current.schoolIcons;
}
