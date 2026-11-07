import { describe, expect, it } from 'vitest';
import { TRAINING_GROUPS, type CharacterData } from '../character';
import type { OcrLine } from './attr-panel';
import { applyTrainingPanel, parseTrainingPanel } from './training-panel';

const line = (text: string, x: number, y: number, width = 240): OcrLine => ({
    text,
    x,
    y,
    width,
    height: 12,
    score: 0.99,
});
const levels = (rows: { name: string; level: number }[]) =>
    Object.fromEntries(rows.map((row) => [row.name, row.level]));

/** 按用户截图的字段与布局构造，经验特意与等级取不同数。 */
const PANEL = [
    line('角色自身修炼', 50, 54),
    line('攻击修炼 等级:11/20 修炼经验:30/1910', 50, 92),
    line('防御修炼 等级:5/20 修炼经验:0/650', 50, 118),
    line('法术修炼 等级:0/20 修炼经验:0/150', 50, 144),
    line('抗法修炼 等级:5/20 修炼经验:0/650', 50, 170),
    line('猎术修炼 等级:0/20 修炼经验:0/150', 50, 196),
    line('召唤兽控制修炼', 50, 239),
    line('攻击控制力 等级:0/20 修炼经验:0/150', 50, 280),
    line('防御控制力 等级:0/20 修炼经验:0/150', 50, 306),
    line('法术控制力 等级:0/20 修炼经验:0/150', 50, 332),
    line('抗法控制力 等级:0/20 修炼经验:0/150', 50, 358),
    line('育兽术 等级:0/35', 50, 384),
];

describe('修炼面板：只读等级', () => {
    it('人物、召唤兽和育兽术共十项，经验不参与结果', () => {
        const result = parseTrainingPanel(PANEL);
        expect(result.hit).toBe(10);
        expect(result.total).toBe(10);
        expect(levels(result.rows)).toEqual({
            攻击修炼: 11,
            防御修炼: 5,
            法术修炼: 0,
            抗法修炼: 5,
            猎术修炼: 0,
            攻击控制力: 0,
            防御控制力: 0,
            法术控制力: 0,
            抗法控制力: 0,
            育兽术: 0,
        });
        expect(result.rows[0]).toEqual({
            name: '攻击修炼',
            level: 11,
            state: 'ok',
            score: 0.99,
        });
    });

    it('名字、等级标签、数字和经验被分框且乱序时，仍按同一行配对', () => {
        const result = parseTrainingPanel([
            line('修炼经验:30/1910', 192, 94, 96),
            line('5/20', 146, 120, 30),
            line('攻击修炼', 50, 92, 48),
            line('等级:', 118, 94, 26),
            line('修炼经验:0/650', 192, 118, 96),
            line('11/20', 146, 94, 30),
            line('防御修炼', 50, 118, 48),
            line('等级:', 118, 120, 26),
        ]);
        expect(result.hit).toBe(2);
        expect(levels(result.rows)).toMatchObject({ 攻击修炼: 11, 防御修炼: 5 });
    });

    it('全角数字、标点和空格可归一；只有等级数字时也可按标签识别', () => {
        const result = parseTrainingPanel([
            line('攻击修炼 等级：１１／２０ 修炼经验：３０／１９１０', 50, 92),
            line('育兽术 等级：３５', 50, 384),
        ]);
        expect(result.hit).toBe(2);
        expect(levels(result.rows)).toMatchObject({ 攻击修炼: 11, 育兽术: 35 });
    });

    it('等级丢失时，不拿经验、下一项等级或截图外的数字补齐', () => {
        const result = parseTrainingPanel([
            line('攻击修炼 修炼经验:30/1910', 50, 92),
            line('防御修炼', 50, 118, 48),
            line('0/650', 192, 118, 40),
            line('法术修炼 等级:2/20 修炼经验:0/150', 50, 144),
            line('35', 50, 384),
        ]);
        expect(result.hit).toBe(1);
        expect(result.rows.find((row) => row.name === '攻击修炼')?.state).toBe('miss');
        expect(result.rows.find((row) => row.name === '防御修炼')?.state).toBe('miss');
        expect(levels(result.rows)['法术修炼']).toBe(2);
        expect(result.rows.find((row) => row.name === '育兽术')?.state).toBe('miss');
    });

    it.each(['-1/20', '1.5/20', '21/20', '0/0', '201', '0/150'])(
        '无效等级 %s 保留为未识别',
        (value) => {
            const result = parseTrainingPanel([line(`攻击修炼 等级:${value}`, 50, 92)]);
            expect(result.hit).toBe(0);
        },
    );

    it('多行被识别为一个文字块时不按顺序猜等级', () => {
        const result = parseTrainingPanel([line('攻击修炼 等级:11/20 防御修炼 等级:5/20', 50, 92)]);
        expect(result.hit).toBe(0);
    });
});

describe('修炼面板：局部写回', () => {
    const card = () =>
        ({
            id: 'training',
            experience: { value: '100万', need: '200万' },
            trainings: TRAINING_GROUPS.map((group) => ({
                title: group.title,
                rows: group.rows.map((row) => ({ name: row.name, level: 7, cap: 40 })),
            })),
            assists: [{ name: '强身术', kind: 'life', level: 98 }],
        }) as CharacterData;

    it('只改识别到的等级，保留未识别项、自定义上限与角色经验', () => {
        const before = card();
        const result = parseTrainingPanel([
            line('攻击修炼 等级:11/20 修炼经验:30/1910', 50, 92),
            line('育兽术 等级:0/35', 50, 384),
        ]);
        const after = applyTrainingPanel(before, result.rows);
        expect(after.trainings[0].rows[0]).toEqual({ name: '攻击修炼', level: 11, cap: 40 });
        expect(after.trainings[0].rows[1]).toBe(before.trainings[0].rows[1]);
        expect(after.trainings[1].rows[4]).toEqual({ name: '育兽术', level: 0, cap: 40 });
        expect(after.experience).toBe(before.experience);
        expect(after.assists).toBe(before.assists);
        expect(before.trainings[0].rows[0].level).toBe(7);
    });

    it('漏识别的项手动修正后可应用，无效等级仍不写入', () => {
        const before = card();
        const result = parseTrainingPanel([]);
        const fixed = result.rows.map((row) =>
            row.name === '猎术修炼' ? { ...row, level: 8, state: 'ok' as const } : row,
        );
        fixed[0] = { ...fixed[0], level: Number.NaN, state: 'ok' };
        const after = applyTrainingPanel(before, fixed);
        expect(after.trainings[0].rows[0]).toBe(before.trainings[0].rows[0]);
        expect(after.trainings[0].rows[4].level).toBe(8);
    });
});
