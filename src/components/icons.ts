/**
 * 图标 = 现成库（tabler）+ 一层「业务名 → 图标组件」的映射。
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
 */
import type { Component } from 'vue';

import {
    IconAdjustmentsHorizontal,
    IconArchive,
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
    IconPencil,
    IconPlus,
    IconSearch,
    IconShield,
    IconSquare,
    IconTag,
    IconTrash,
    IconUpload,
    IconUsers,
    IconWallet,
    IconX,
} from '@tabler/icons-vue';

export type IconName =
    | 'overview'
    | 'income'
    | 'equipment'
    | 'prices'
    | 'characters'
    | 'accounts'
    | 'goals'
    | 'settings'
    | 'add'
    | 'edit'
    | 'trash'
    | 'search'
    | 'filter'
    | 'archive'
    | 'camera'
    | 'paste'
    | 'upload'
    | 'download'
    | 'calendar'
    | 'clock'
    | 'pin'
    | 'check'
    | 'chevron-down'
    | 'chevron-right'
    | 'minimize'
    | 'maximize'
    | 'restore'
    | 'close';

export const ICONS: Record<IconName, Component> = {
    /* ---------- 导航 ---------- */
    overview: IconLayoutDashboard,
    // 收益用「钞票」而不是「硬币」：硬币在 24 网格里必然带一个货币符号，
    // 显示到 14px 时符号糊成一道竖线，而且 ¥/$ 都跟游戏币对不上；钞票是矩形加一圆，轮廓最稳。
    income: IconCash,
    equipment: IconShield,
    prices: IconTag,
    characters: IconUsers,
    accounts: IconWallet,
    goals: IconFlag,
    // 设置：两条横线带滑块，读作「调节」；用齿轮在 14px 下会糊成太阳。
    settings: IconAdjustmentsHorizontal,

    /* ---------- 动作 ---------- */
    add: IconPlus,
    edit: IconPencil,
    trash: IconTrash,
    search: IconSearch,
    filter: IconFilter,
    archive: IconArchive,
    camera: IconCamera,
    paste: IconClipboard,
    upload: IconUpload,
    download: IconDownload,
    calendar: IconCalendar,
    clock: IconClock,
    pin: IconMapPin,
    check: IconCheck,
    'chevron-down': IconChevronDown,
    'chevron-right': IconChevronRight,

    /* ---------- 窗口按钮 ---------- */
    minimize: IconMinus,
    maximize: IconSquare,
    restore: IconCopy,
    close: IconX,
};

/** 中文名只给设置页的清单用；业务页面自己写文案，不从这里取。 */
export const ICON_LABELS: Record<IconName, string> = {
    overview: '总览',
    income: '收益',
    equipment: '装备',
    prices: '物价',
    characters: '角色',
    accounts: '账号',
    goals: '目标',
    settings: '设置',
    add: '新增',
    edit: '编辑',
    trash: '删除',
    search: '搜索',
    filter: '筛选',
    archive: '归档',
    camera: '截图',
    paste: '粘贴',
    upload: '上传',
    download: '下载',
    calendar: '日期',
    clock: '计时',
    pin: '定位',
    check: '勾选',
    'chevron-down': '下拉',
    'chevron-right': '右折',
    minimize: '最小化',
    maximize: '最大化',
    restore: '还原',
    close: '关闭',
};

/** 分组只影响设置页的排布：导航、动作、窗口三种用途不该混在一张表里。 */
export const ICON_GROUPS: { label: string; note: string; names: IconName[] }[] = [
    {
        label: '导航',
        note: '左栏八个入口',
        names: ['overview', 'income', 'equipment', 'prices', 'characters', 'accounts', 'goals', 'settings'],
    },
    {
        label: '动作',
        note: '按钮与行操作',
        names: [
            'add',
            'edit',
            'trash',
            'search',
            'filter',
            'archive',
            'camera',
            'paste',
            'upload',
            'download',
            'calendar',
            'clock',
            'pin',
            'check',
            'chevron-down',
            'chevron-right',
        ],
    },
    {
        label: '窗口',
        note: '标题栏三键',
        names: ['minimize', 'maximize', 'restore', 'close'],
    },
];
