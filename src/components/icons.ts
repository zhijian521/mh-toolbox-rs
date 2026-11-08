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
 * 改四处，少改一处不会报错——中文名漏了界面上就是空白，分组漏了开发页目录就少一格，
 * 全是「跑起来才发现」的错。现在只有 `ICON_META` 一张，其余全部派生：
 * `IconName` 从 key 推、`ICONS` / `ICON_LABELS` / `ICON_GROUPS` 从值推。
 * 加图标 = 表里加一行，漏字段 = 类型报错。
 */
import type { Component } from 'vue';

import {
    IconAdjustmentsHorizontal,
    IconAlarm,
    IconArchive,
    IconArrowLeft,
    IconBolt,
    IconBook,
    IconBrandGithubFilled,
    IconCash,
    IconCheck,
    IconChevronDown,
    IconChevronRight,
    IconCoins,
    IconCopy,
    IconCreditCard,
    IconDownload,
    IconFileText,
    IconFlag,
    IconFlask,
    IconHistory,
    IconInfoCircle,
    IconLayoutDashboard,
    IconLayoutGrid,
    IconMapPin,
    IconMinus,
    IconMoon,
    IconPaw,
    IconPencil,
    IconPlayerPlay,
    IconPlayerStop,
    IconPlus,
    IconScan,
    IconSearch,
    IconSquare,
    IconSun,
    IconSword,
    IconTag,
    IconTool,
    IconTrash,
    IconTrendingUp,
    IconUpload,
    IconUsers,
    IconWallet,
    IconX,
} from '@tabler/icons-vue';

/** 分组只影响开发页图标目录（`views/dev/IconsSection.vue`）的排布：
 * 导航、动作、外壳、窗口四种用途不该混在一张清单里。 */
type IconGroup = 'nav' | 'action' | 'shell' | 'window';

/** 分组标题与显示顺序。表的顺序就是开发页目录里出现的顺序。 */
const GROUP_META: { id: IconGroup; label: string; note: string }[] = [
    { id: 'nav', label: '导航', note: '左栏八个入口' },
    { id: 'action', label: '动作', note: '按钮与行操作' },
    { id: 'shell', label: '外壳', note: '侧栏与主题' },
    { id: 'window', label: '窗口', note: '标题栏三键' },
];

interface IconEntry {
    /** 库里的图标组件，原样引用，不改几何。 */
    glyph: Component;
    /** 中文名只给开发页的图标目录用；业务页面自己写文案，不从这里取。 */
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
    // 返回 / 开始 / 停止 / 测试四个是与「跑起来」直接相关的动作，排在最前。
    // 早先这四处用的是「纯文字按钮 + 箭头字符」，箭头的大小与基线跟中文字对不齐。
    back: { glyph: IconArrowLeft, label: '返回', group: 'action' },
    play: { glyph: IconPlayerPlay, label: '开始', group: 'action' },
    stop: { glyph: IconPlayerStop, label: '停止', group: 'action' },
    // 测试文字入口：烧瓶＝「不进正式流程的试跑」，比齿轮/扳手更像实验而不是设置。
    flask: { glyph: IconFlask, label: '测试', group: 'action' },
    add: { glyph: IconPlus, label: '新增', group: 'action' },
    subtract: { glyph: IconMinus, label: '减少', group: 'action' },
    // 时钟带一圈逆时针箭头：历史是「往回看」。用铅笔/本子会与「记一笔」撞脸，
    // 而这两个动作在收益页上恰好一前一后并排（历史收益 / 物品速记）。
    history: { glyph: IconHistory, label: '历史', group: 'action' },
    /* 闹钟：带两只铃的钟。与上面那枚「历史」都是钟，但形状分得开——历史是一圈
     * 逆时针箭头、没有铃；这一枚没有箭头、顶上两只耳朵。两者在图标目录里相邻，
     * 正是要通过「有没有铃」一眼区分「回看过去」与「等到某点」。 */
    alarm: { glyph: IconAlarm, label: '闹钟', group: 'action' },
    /* 资源是一面**网格**：一格一张图。用「文件夹」会读成「打开一个目录」，
     * 用「图片」只有一张；九宫格正好是这一页的样子。 */
    grid: { glyph: IconLayoutGrid, label: '资源', group: 'action' },
    // 编辑用铅笔画斜线：账号/角色这种东西「改一行」与「删掉重录」是两件事，
    // 卡头上两枚并排时，一支笔与一只桶一眼分得开；用「设置齿轮」会与左栏设置撞脸。
    edit: { glyph: IconPencil, label: '编辑', group: 'action' },
    /* 四角括线里一条横线：OCR / 取景的通用符号。**不用相机**——相机说的是「现在拍一张」，
     * 而这个入口吃的是已经从游戏里截好的图（粘进来或选文件）。 */
    scan: { glyph: IconScan, label: '识别', group: 'action' },
    trash: { glyph: IconTrash, label: '删除', group: 'action' },
    search: { glyph: IconSearch, label: '搜索', group: 'action' },
    archive: { glyph: IconArchive, label: '归档', group: 'action' },
    // 方向按**文件**走，不按「数据流」走：导出是把账写成一份文件拿走（箭头朝下落到纸面），
    // 导入是把一份文件读回来（箭头朝上离开纸面）。两枚并排时方向相反才读得出是一进一出，
    // 用同一个盒子图标会读成两个一样的动作。
    download: { glyph: IconDownload, label: '导出', group: 'action' },
    upload: { glyph: IconUpload, label: '导入', group: 'action' },
    pin: { glyph: IconMapPin, label: '定位', group: 'action' },
    check: { glyph: IconCheck, label: '勾选', group: 'action' },
    // 圆圈里的 i 是通用符号，不用「感叹号」是因为它读起来像错误。
    // 注意 `NotifyHost` **不用**它：那道凹槽只留一根 3px 竖条，两个彩色记号会互相抵消。
    info: { glyph: IconInfoCircle, label: '提示', group: 'action' },
    /* 「一份可读的条款」：关于卡的「许可证全文」用。选文件而不是印章或天平——
     * 这枚要说的是「点开有一整篇文字」，不是「这里具有法律效力」。 */
    doc: { glyph: IconFileText, label: '条款', group: 'action' },
    'chevron-down': { glyph: IconChevronDown, label: '下拉', group: 'action' },
    'chevron-right': { glyph: IconChevronRight, label: '右折', group: 'action' },

    /* ---------- 账目分类（账号页的快捷入口） ----------
     *
     * 这七枚不是「动作」而是**东西**：账号页的快捷记账是「我买了什么」，
     * 一眼认出是装备还是召唤兽，比认出「新增」更重要。
     *
     * 都选轮廓清楚、笔画少的：14px 下 `sword` 的斜刃与 `paw` 的四个趾垫仍分得开，
     * 换成 `shield`（内部分层多）或 `cat`（胡须是细线）就糊了。 */
    sword: { glyph: IconSword, label: '装备', group: 'action' },
    paw: { glyph: IconPaw, label: '召唤兽', group: 'action' },
    card: { glyph: IconCreditCard, label: '点卡', group: 'action' },
    coins: { glyph: IconCoins, label: '游戏币', group: 'action' },
    growth: { glyph: IconTrendingUp, label: '养成', group: 'action' },
    // 闪电＝「日常产出」，与收益页的「打金」同义；用钱袋会与 `coins` 撞。
    bolt: { glyph: IconBolt, label: '产出', group: 'action' },
    // 账本：兜底的「其他收支」。这一枚与左栏「收益」用的 `IconCash` 不同——
    // 那一个是钱，这一个是一本记着钱的册子。
    ledger: { glyph: IconBook, label: '其他', group: 'action' },

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
