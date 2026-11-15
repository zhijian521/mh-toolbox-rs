/** 子流程列出必要前置；跳过前置会把测试数据缺失误报为产品错误。 */
export const CHARACTER_SCENARIOS = {
    基础: [],
    截图: ['ocr'],
    召唤兽: ['pets'],
    快速修改: ['ocr', 'pets', 'quick'],
    装备: ['pets', 'equipment'],
    统计: ['pets', 'stats'],
    成长历史: ['history'],
};

const SECTIONS = [
    '导航',
    '角色',
    '物价',
    '收益',
    '账号',
    '目标',
    '设置',
    '工具',
    '收益日期',
    '数据',
    '收尾',
];
const ALL_CHARACTER_STEPS = ['ocr', 'pets', 'quick', 'equipment', 'stats', 'history'];
const OCR_SCENARIOS = {
    属性: ['attributes'],
    // 属性原图先识别门派，师门场景才能核对对应的七项技能。
    师门: ['attributes', 'skills'],
    辅助: ['assists'],
    修炼: ['training'],
    // 草稿需要门派固定技能，并会删除已识别的强身术。
    草稿: ['attributes', 'assists', 'draft'],
    换图: ['queue'],
};
const EQUIPMENT_SCENARIOS = {
    入口: ['entry'],
    快速修改: ['entry', 'quick'],
    // 批量场景检查快速修改后的防御与备注仍被保留。
    批量: ['entry', 'quick', 'batch'],
    原图: ['entry', 'originals'],
};
const ALL_OCR_SCENARIOS = ['attributes', 'skills', 'assists', 'training', 'draft', 'queue'];
const ALL_EQUIPMENT_SCENARIOS = ['entry', 'quick', 'batch', 'originals'];

export function createSelection(only = '', skip = '') {
    const choices = [
        ...SECTIONS,
        ...Object.keys(CHARACTER_SCENARIOS).map((key) => `角色/${key}`),
        ...Object.keys(OCR_SCENARIOS).map((key) => `角色/截图/${key}`),
        ...Object.keys(EQUIPMENT_SCENARIOS).map((key) => `角色/装备/${key}`),
    ];
    for (const value of [only, skip]) {
        if (value && !choices.includes(value)) throw new Error(`未知烟测分区：${value}`);
    }
    // skip 只跳过完整页面，避免移除子流程后破坏其他流程的数据前置。
    if (skip.includes('/')) throw new Error('--skip 仅支持完整页面，请用 --only 选择角色子流程。');
    const page = only.split('/')[0];
    const want = (key) => (!page || key.includes(page)) && (!skip || !key.includes(skip));
    if (!SECTIONS.some(want)) throw new Error('烟测选择范围为空，请调整 --only / --skip。');
    const [, scenario, detail] = only.split('/');
    const characterSteps = scenario ? CHARACTER_SCENARIOS[scenario] : ALL_CHARACTER_STEPS;
    const ocrScenarios = scenario === '截图' && detail ? OCR_SCENARIOS[detail] : ALL_OCR_SCENARIOS;
    const equipmentScenarios =
        scenario === '装备' && detail ? EQUIPMENT_SCENARIOS[detail] : ALL_EQUIPMENT_SCENARIOS;
    return { want, characterSteps, ocrScenarios, equipmentScenarios };
}
