/**
 * 图标 = 现成库（tabler）+ 一层「业务名 → 图标」的映射。
 *
 * 为什么不再手画：早先这里是 28 个手写的 16 格 path。问题不在画得对不对，而在**一致性**——
 * 一次画完的 28 个图标，圆角半径、边长比例、视觉留白各走各的，放大看就参差；
 * 每加一个图标都要重新对齐一次，成本只会往上走。成套库把这件事一次性解决。
 *
 * 为什么是 tabler 而不是 lucide：两库同为 24 网格，同一批图标并排看过，
 * tabler 的转角更硬（总览是直角四方格，lucide 是圆角），更贴账簿「圆角归零、结构靠线」的规矩；
 * lucide 更圆润，容易滑向通用后台界面。两库都试过，lucide 已卸掉，换回去只需改这一张表。
 *
 * 规格不由库决定，由 `AppIcon.vue` 的 CSS 决定：24 网格、笔宽 1.8 user units
 * （显示 14px 时约 1.05 物理像素，与账线同一种细笔）、尺寸 `calc(14px * var(--fs-scale))`。
 *
 * ---- 为什么只有一张表 ----
 * 原先这里是四张平行的表：图标映射、中文名、分组、名字联合类型。四张表意味着加一个图标要
 * 改四处，少改一处不会报错——中文名漏了界面上就是空白，分组漏了设置页就少一格，
 * 全是「跑起来才发现」的错。现在只有 `ICON_META` 一张，其余全部派生：
 * `IconName` 从 key 推、`ICONS` / `ICON_LABELS` / `ICON_GROUPS` 从值推。
 * 加图标 = 表里加一行，漏字段 = 类型报错。
 */
import type { Component } from 'vue';

import {
    IconAdjustmentsHorizontal,
    IconArchive,
    IconBrandGithubFilled,
    IconCalendar,
    IconCamera,
    IconCash,
    IconCheck,
    IconChevronDown,
    IconChevronRight,
    IconClipboard,
    IconClock,
    IconCopy,
    IconDownload,
    IconFilter,
    IconFlag,
    IconLayoutDashboard,
    IconMapPin,
    IconMinus,
    IconMoon,
    IconPencil,
    IconPlus,
    IconSearch,
    IconSquare,
    IconSun,
    IconTag,
    IconTool,
    IconTrash,
    IconUpload,
    IconUsers,
    IconWallet,
    IconX,
} from '@tabler/icons-vue';

/** 分组只影响设置页的排布：导航、动作、外壳、窗口四种用途不该混在一张清单里。 */
type IconGroup = 'nav' | 'action' | 'shell' | 'window';

/** 分组标题与显示顺序。表的顺序就是设置页里出现的顺序。 */
const GROUP_META: { id: IconGroup; label: string; note: string }[] = [
    { id: 'nav', label: '导航', note: '左栏八个入口' },
    { id: 'action', label: '动作', note: '按钮与行操作' },
    { id: 'shell', label: '外壳', note: '侧栏与主题' },
    { id: 'window', label: '窗口', note: '标题栏三键' },
];

interface IconEntry {
    /** 库里的图标组件，原样引用，不改几何。 */
    glyph: Component;
    /** 中文名只给设置页的清单用；业务页面自己写文案，不从这里取。 */
    label: string;
    group: IconGroup;
}

/**
 * 唯一真源。顺序即清单顺序，所以这里的分组是按用途成段写的。
 */
const ICON_META = {
    /* ---------- 导航 ---------- */
    overview: { glyph: IconLayoutDashboard, label: '总览', group: 'nav' },
    // 收益用「钞票」而不是「硬币」：硬币在 24 网格里必然带一个货币符号，
    // 显示到 14px 时符号糊成一道竖线，而且 ¥/$ 都跟游戏币对不上；钞票是矩形加一圆，轮廓最稳。
    income: { glyph: IconCash, label: '收益', group: 'nav' },
    prices: { glyph: IconTag, label: '物价', group: 'nav' },
    characters: { glyph: IconUsers, label: '角色', group: 'nav' },
    accounts: { glyph: IconWallet, label: '账号', group: 'nav' },
    goals: { glyph: IconFlag, label: '目标', group: 'nav' },
    // 工具用单把扳手，不用「扳手+螺丝刀」那种两件交叉：14px 下交叉会糊成一团，
    // 单件的斜柄加开口仍是清楚的轮廓。
    tools: { glyph: IconTool, label: '工具', group: 'nav' },
    // 设置：两条横线带滑块，读作「调节」；用齿轮在 14px 下会糊成太阳。
    settings: { glyph: IconAdjustmentsHorizontal, label: '设置', group: 'nav' },

    /* ---------- 动作 ---------- */
    add: { glyph: IconPlus, label: '新增', group: 'action' },
    edit: { glyph: IconPencil, label: '编辑', group: 'action' },
    trash: { glyph: IconTrash, label: '删除', group: 'action' },
    search: { glyph: IconSearch, label: '搜索', group: 'action' },
    filter: { glyph: IconFilter, label: '筛选', group: 'action' },
    archive: { glyph: IconArchive, label: '归档', group: 'action' },
    camera: { glyph: IconCamera, label: '截图', group: 'action' },
    paste: { glyph: IconClipboard, label: '粘贴', group: 'action' },
    upload: { glyph: IconUpload, label: '上传', group: 'action' },
    download: { glyph: IconDownload, label: '下载', group: 'action' },
    calendar: { glyph: IconCalendar, label: '日期', group: 'action' },
    clock: { glyph: IconClock, label: '计时', group: 'action' },
    pin: { glyph: IconMapPin, label: '定位', group: 'action' },
    check: { glyph: IconCheck, label: '勾选', group: 'action' },
    'chevron-down': { glyph: IconChevronDown, label: '下拉', group: 'action' },
    'chevron-right': { glyph: IconChevronRight, label: '右折', group: 'action' },

    /* ---------- 外壳 ---------- */
    // 太阳/月亮只表示「点了会变成什么」，不表示当前状态——按钮说的是下一步。
    sun: { glyph: IconSun, label: '日间', group: 'shell' },
    moon: { glyph: IconMoon, label: '夜间', group: 'shell' },
    // GitHub 用实心标。线性版（24 网格里那只猫的轮廓线）14px 下糊成一个方框，
    // 实心剪影至少还认得出耳朵和尾巴——品牌标宁可重一点，也要认得出。
    github: { glyph: IconBrandGithubFilled, label: '仓库', group: 'shell' },

    /* ---------- 窗口按钮 ---------- */
    minimize: { glyph: IconMinus, label: '最小化', group: 'window' },
    maximize: { glyph: IconSquare, label: '最大化', group: 'window' },
    restore: { glyph: IconCopy, label: '还原', group: 'window' },
    close: { glyph: IconX, label: '关闭', group: 'window' },
} satisfies Record<string, IconEntry>;

/** 业务名联合类型。加图标只改上面那张表，这里自动跟着长。 */
export type IconName = keyof typeof ICON_META;

const NAMES = Object.keys(ICON_META) as IconName[];

/** 业务名 → 组件。`AppIcon` 只认这一张。 */
export const ICONS: Record<IconName, Component> = Object.fromEntries(
    NAMES.map((name) => [name, ICON_META[name].glyph]),
) as Record<IconName, Component>;

/** 业务名 → 中文名。 */
export const ICON_LABELS: Record<IconName, string> = Object.fromEntries(
    NAMES.map((name) => [name, ICON_META[name].label]),
) as Record<IconName, string>;

/** 按 `GROUP_META` 的顺序分组，组内保持表里的书写顺序。 */
export const ICON_GROUPS: { label: string; note: string; names: IconName[] }[] = GROUP_META.map(
    (group) => ({
        label: group.label,
        note: group.note,
        names: NAMES.filter((name) => ICON_META[name].group === group.id),
    }),
);
