import type { IconName } from '../../components/icons';
import { TOOLS } from '../../tools';
import type { PaneKey } from '../characters/character';

export interface HomeShortcut {
    id: string;
    text: string;
    description: string;
    icon: IconName;
    group: string;
    tone: 'accent' | 'indigo' | 'moss' | 'ochre';
    path: string;
    action?: string;
    pane?: PaneKey;
    href?: string;
}

export const HOME_SHORTCUTS: HomeShortcut[] = [
    {
        id: 'characters',
        text: '角色名册',
        description: '查看全部角色',
        icon: 'characters',
        group: '角色',
        tone: 'accent',
        path: '/characters',
    },
    {
        id: 'character-new',
        text: '新增角色',
        description: '建立角色档案',
        icon: 'add',
        group: '角色',
        tone: 'accent',
        path: '/characters',
        action: 'new',
    },
    {
        id: 'character-attrs',
        text: '属性',
        description: '修改与截图识别',
        icon: 'scan',
        group: '角色',
        tone: 'accent',
        path: '/characters',
        action: 'edit',
        pane: 'attrs',
    },
    {
        id: 'character-skills',
        text: '师门',
        description: '师门技能与等级',
        icon: 'growth',
        group: '角色',
        tone: 'indigo',
        path: '/characters',
        action: 'edit',
        pane: 'skills',
    },
    {
        id: 'character-assist',
        text: '辅助',
        description: '生活与剧情技能',
        icon: 'ledger',
        group: '角色',
        tone: 'moss',
        path: '/characters',
        action: 'edit',
        pane: 'assist',
    },
    {
        id: 'character-training',
        text: '修炼',
        description: '人物与召唤兽修炼',
        icon: 'growth',
        group: '角色',
        tone: 'ochre',
        path: '/characters',
        action: 'edit',
        pane: 'training',
    },
    {
        id: 'character-gear',
        text: '装备',
        description: '装备与灵饰',
        icon: 'sword',
        group: '角色',
        tone: 'indigo',
        path: '/characters',
        action: 'edit',
        pane: 'gear',
    },
    {
        id: 'character-pets',
        text: '召唤兽',
        description: '资质与技能',
        icon: 'paw',
        group: '角色',
        tone: 'moss',
        path: '/characters',
        action: 'edit',
        pane: 'pets',
    },
    {
        id: 'income-quick',
        text: '物品速记',
        description: '记录游戏产出',
        icon: 'income',
        group: '收益',
        tone: 'moss',
        path: '/income',
    },
    {
        id: 'income-history',
        text: '收益历史',
        description: '按天与角色查账',
        icon: 'history',
        group: '收益',
        tone: 'indigo',
        path: '/income',
        action: 'history',
    },
    {
        id: 'online-start',
        text: '角色上线',
        description: '选择角色开始计时',
        icon: 'play',
        group: '收益',
        tone: 'moss',
        path: '/income',
        action: 'start',
    },
    {
        id: 'online-backfill',
        text: '补记在线',
        description: '补录过去时段',
        icon: 'edit',
        group: '收益',
        tone: 'ochre',
        path: '/income',
        action: 'backfill',
    },
    {
        id: 'online-records',
        text: '在线记录',
        description: '时长与点卡',
        icon: 'history',
        group: '收益',
        tone: 'indigo',
        path: '/income',
        action: 'records',
    },
    {
        id: 'accounts',
        text: '账号收支',
        description: '收支统计与渠道',
        icon: 'accounts',
        group: '账号',
        tone: 'accent',
        path: '/accounts',
    },
    {
        id: 'account-new',
        text: '记一笔',
        description: '收入与支出',
        icon: 'accounts',
        group: '账号',
        tone: 'accent',
        path: '/accounts',
        action: 'new',
    },
    {
        id: 'account-history',
        text: '账号历史',
        description: '全部收支明细',
        icon: 'history',
        group: '账号',
        tone: 'indigo',
        path: '/accounts',
        action: 'history',
    },
    {
        id: 'prices',
        text: '物价行情',
        description: '查行情与记价格',
        icon: 'prices',
        group: '物价',
        tone: 'indigo',
        path: '/prices',
    },
    {
        id: 'price-new',
        text: '添加物价',
        description: '新增物品行情',
        icon: 'add',
        group: '物价',
        tone: 'indigo',
        path: '/prices',
        action: 'new',
    },
    {
        id: 'goals',
        text: '目标',
        description: '查看养成与进度',
        icon: 'goals',
        group: '目标',
        tone: 'ochre',
        path: '/goals',
    },
    {
        id: 'goal-new',
        text: '新增目标',
        description: '设定养成计划',
        icon: 'goals',
        group: '目标',
        tone: 'accent',
        path: '/goals',
        action: 'new',
    },
    ...TOOLS.filter((one) => one.ready).map((one): HomeShortcut => ({
        id: 'tool-' + one.key,
        text: one.name,
        description: one.desc,
        icon: one.icon,
        group: '工具',
        tone: one.group === 'daily' ? 'ochre' : one.group === 'game' ? 'moss' : 'indigo',
        path: one.kind === 'page' ? one.path : '',
        ...(one.kind === 'link' ? { href: one.href } : {}),
    })),
    {
        id: 'alarm-new',
        text: '新增闹钟',
        description: '设定提醒时刻',
        icon: 'add',
        group: '工具',
        tone: 'ochre',
        path: '/tools/alarm',
        action: 'new',
    },
    {
        id: 'settings',
        text: '设置',
        description: '主题、字号与数据',
        icon: 'settings',
        group: '设置',
        tone: 'indigo',
        path: '/settings',
    },
];

export const DEFAULT_SHORTCUT_IDS = [
    'account-new',
    'price-new',
    'tool-ghost',
    'tool-alarm',
    'income-quick',
    'goal-new',
    'tool-activities',
    'online-records',
];
const knownIds = new Set(HOME_SHORTCUTS.map((one) => one.id));

/** 空数组表示用户有意隐藏全部；未知和重复 id 不占位置。 */
export function normalizeShortcutIds(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [...DEFAULT_SHORTCUT_IDS];
    return [
        ...new Set(raw.filter((id): id is string => typeof id === 'string' && knownIds.has(id))),
    ];
}

export function shortcutsByIds(ids: readonly string[]): HomeShortcut[] {
    const byId = new Map(HOME_SHORTCUTS.map((one) => [one.id, one]));
    return ids.flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
    });
}

/** 将一项移动到目标位置，其他项相对顺序不变。 */
export function moveShortcut(ids: readonly string[], id: string, to: number): string[] {
    const next = [...ids];
    const from = next.indexOf(id);
    if (from < 0 || !Number.isInteger(to)) return next;
    next.splice(from, 1);
    next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
    return next;
}
