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

export function createSelection(only = '', skip = '') {
    const choices = [...SECTIONS, ...Object.keys(CHARACTER_SCENARIOS).map((key) => `角色/${key}`)];
    for (const value of [only, skip]) {
        if (value && !choices.includes(value)) throw new Error(`未知烟测分区：${value}`);
    }
    // skip 只跳过完整页面，避免移除子流程后破坏其他流程的数据前置。
    if (skip.includes('/')) throw new Error('--skip 仅支持完整页面，请用 --only 选择角色子流程。');
    const page = only.split('/')[0];
    const want = (key) => (!page || key.includes(page)) && (!skip || !key.includes(skip));
    if (!SECTIONS.some(want)) throw new Error('烟测选择范围为空，请调整 --only / --skip。');
    const scenario = only.split('/')[1];
    const characterSteps = scenario ? CHARACTER_SCENARIOS[scenario] : ALL_CHARACTER_STEPS;
    return { want, characterSteps };
}
