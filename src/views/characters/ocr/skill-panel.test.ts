import { describe, expect, it, vi } from 'vitest';
import type { CharacterData } from '../character';
import type { OcrLine } from './attr-panel';
import { applySkillPanel, parseSkillPanel } from './skill-panel';

/* 门派七项与上限都来自 `fetch` 回来的真表（`public/game/data/schools.json`），
 * vitest 里没有启动流程，读到的是空表——「换门派就换技能表」那条路会直接短路成
 * 「门派未知，原样返回」。所以把这两个出口换掉：验的是**配对的规则**，
 * 不验五庄观那七项各叫什么（那是 `schools.ts` 自己的测试）。
 *
 * `vi.mock` 会被提到文件顶部执行，所以这里不能引用下面的 `NAMES`——内联一份。 */
vi.mock('../schools', () => ({
    schoolSkillNames: (school: string) =>
        school === '五庄观'
            ? ['周易学', '潇湘仙雨', '乾坤袖', '修仙术', '混元道果', '明性修身', '七星遁']
            : undefined,
    schoolSkills: (school: string, previous: { name: string; level: number }[] = []) =>
        school === '五庄观'
            ? ['周易学', '潇湘仙雨', '乾坤袖', '修仙术', '混元道果', '明性修身', '七星遁'].map(
                  (name) => ({
                      name,
                      level: previous.find((row) => row.name === name)?.level ?? 0,
                      cap: 180,
                  }),
              )
            : previous,
}));

vi.mock('../../../services/game-data', () => ({ schoolSkillCap: () => 180 }));

/**
 * 数据全部来自**深蓝列表的一次 OCR**（用户提供的五庄观面板截图），
 * 坐标是 `ocr_frame` 吐出来的原值。用真数据而不是编的：
 * 「数字在锚点下方」这条判据的容差、以及「七星遁被读成七星适」这种错法，
 * 都是照着实际输出定的，编一个整齐的网格测不出真问题。
 */

/** 五庄观七项，顺序按 `schools.json`（也是卡上的顺序）。 */
const NAMES = ['周易学', '潇湘仙雨', '乾坤袖', '修仙术', '混元道果', '明性修身', '七星遁'];

const line = (text: string, x: number, y: number, width: number, height: number): OcrLine => ({
    text,
    x,
    y,
    width,
    height,
    score: 0.99,
});

/** 深蓝版式：竖排「图标 名字」，等级在名字下面一行。 */
const DEEP: OcrLine[] = [
    line('师门技能', 141, 20, 55, 13),
    line('师门技能', 63, 54, 56, 15),
    line('师门法术', 199, 54, 56, 15),
    line('人物国性', 5, 61, 14, 55),
    line('周易学', 81, 80, 42, 15),
    line('120', 80, 97, 20, 11),
    line('潇湘仙雨', 80, 117, 57, 16),
    line('师门技能', 4, 135, 14, 56),
    line('115', 80, 135, 20, 11),
    line('乾坤袖', 80, 156, 42, 15),
    line('60', 80, 173, 14, 12),
    line('修仙术', 79, 193, 44, 17),
    line('辅助技能', 4, 208, 14, 56),
    line('120', 80, 211, 20, 12),
    line('混元道果', 81, 232, 56, 14),
    line('90', 80, 249, 15, 12),
    line('明性修身', 80, 269, 57, 17),
    line('修炼技能', 4, 282, 14, 57),
    line('90', 80, 287, 15, 12),
    /* 真实的一次误读：「遁」被认成「适」。 */
    line('七星适', 81, 308, 42, 14),
    line('60', 80, 325, 14, 11),
    line('特技', 35, 355, 29, 16),
    line('经脉流派', 183, 356, 56, 14),
];

const levelsOf = (rows: { name: string; level: number }[]) =>
    Object.fromEntries(rows.map((row) => [row.name, row.level]));

describe('师门面板：深蓝列表（有技能名）', () => {
    it('七项名字与等级都对上——等级在名字的下一行', () => {
        const { rows, hit, total } = parseSkillPanel(DEEP, NAMES);
        expect(hit).toBe(7);
        expect(total).toBe(7);
        expect(levelsOf(rows)).toEqual({
            周易学: 120,
            潇湘仙雨: 115,
            乾坤袖: 60,
            修仙术: 120,
            混元道果: 90,
            明性修身: 90,
            七星遁: 60,
        });
    });

    it('「七星适」这种一字之差也算认出来（标存疑）', () => {
        const row = parseSkillPanel(DEEP, NAMES).rows.find((one) => one.name === '七星遁');
        expect(row?.level).toBe(60);
        expect(row?.state).toBe('guess');
    });

    it('缺一项技能名时，不把相邻等级配给它', () => {
        /* 把「混元道果」那一行抽掉：它的等级 90 不能被邻居认领。 */
        const lines = DEEP.filter((one) => one.text !== '混元道果');
        const rows = parseSkillPanel(lines, NAMES).rows;
        expect(rows.find((one) => one.name === '混元道果')?.state).toBe('miss');
        expect(levelsOf(rows)['明性修身']).toBe(90);
    });
});

describe('师门面板：只有名字才能配对', () => {
    it('只有数字的旧版格子图不再按位置推断技能', () => {
        const result = parseSkillPanel([line('120', 80, 97, 20, 11)], NAMES);
        expect(result.hit).toBe(0);
        expect(result.rows.every((row) => row.state === 'miss')).toBe(true);
    });
});

describe('写回角色', () => {
    const card = (patch: Partial<CharacterData> = {}): CharacterData =>
        ({
            id: 'x',
            name: '归岚',
            school: '五庄观',
            skills: [],
            ...patch,
        }) as CharacterData;

    it('只写认出来的项，没认到的保留原值', () => {
        const rows = parseSkillPanel(DEEP, NAMES).rows.map((row) =>
            row.name === '修仙术' ? { ...row, state: 'miss' as const, level: 0 } : row,
        );
        const before = card({
            skills: [{ name: '修仙术', level: 33, cap: 180 }],
        });
        const after = applySkillPanel(before, rows);
        expect(after.skills.find((row) => row.name === '修仙术')?.level).toBe(33);
        expect(after.skills.find((row) => row.name === '周易学')?.level).toBe(120);
    });

    it('顺序与上限由门派定，且 0 级是合法值', () => {
        const rows = parseSkillPanel(DEEP, NAMES).rows.map((row) => ({ ...row, level: 0 }));
        const after = applySkillPanel(card(), rows);
        expect(after.skills.map((row) => row.name)).toEqual(NAMES);
        expect(after.skills.every((row) => row.level === 0)).toBe(true);
        expect(after.skills.every((row) => row.cap === 180)).toBe(true);
    });

    it('门派未知时原样返回（不知道该有哪七项）', () => {
        const before = card({ school: '', skills: [{ name: '随便', level: 5 }] });
        const rows = parseSkillPanel(DEEP, NAMES).rows;
        expect(applySkillPanel(before, rows)).toBe(before);
    });
});
