import { describe, expect, it } from 'vitest';
import rulesJson from '../../../../public/game/data/pet-panel.json';
import { parsePetPanel as parse, applyPetPanel, emptyPet } from './pet-panel';
import { parsePetPanel as parseRules } from '../../../services/pet-assets';
import { normalizePet } from '../details';
import type { OcrLine } from './attr-panel';
import samples from '../../../../tools/e2e/fixtures/pet-panel-cases.json';

const rules = parseRules(rulesJson);
function line(text: string, x: number, y: number, width = 120): OcrLine {
    return { text, x, y, width, height: 24, score: 0.98 };
}

describe('召唤兽截图字段', () => {
    it.each(samples)('$name：竖向合并标签的真实 OCR 仍能填入成长和寿命', ({ lines, expected }) => {
        expect(parse(lines, rules).patch).toMatchObject({
            life: expected.life,
            growth: expected.growth,
        });
    });

    it('按数值列取真实读数，漏数字不猜值，已有完整标签优先', () => {
        const source = samples[0].lines;
        expect(
            parse(
                source.filter((one) => one.text !== '1.264'),
                rules,
            ).patch.growth,
        ).toBeUndefined();
        expect(
            parse(
                source.map((one) => (one.text === '1159' ? { ...one, x: 100 } : one)),
                rules,
            ).patch.life,
        ).toBeUndefined();
        expect(parse([...source, line('成长1.300', 520, 438, 300)], rules).patch.growth).toBe(
            '1.300',
        );
        const incomplete = source.filter(
            (one) => !['攻击资质', '防御资质', '体力资质', '法力资质'].includes(one.text),
        );
        expect(parse(incomplete, rules).patch.growth).toBeUndefined();
    });

    it('左右窗口同图：上限、加点、六资质不串列，潜能零保留', () => {
        const lines = [
            line('召唤兽属性', 300, 0),
            line('远山', 110, 80),
            line('139级', 110, 115),
            line('小狗', 110, 170),
            line('123级', 110, 200),
            line('远山', 390, 440),
            line('改名', 630, 440),
            line('气血4238/4238', 24, 490, 240),
            line('体质440', 326, 490),
            line('魔法556/931', 24, 540, 240),
            line('魔力149', 326, 540),
            line('攻击2016', 24, 590),
            line('力量763', 326, 590),
            line('防御772', 24, 640),
            line('耐力161', 326, 640),
            line('速度254', 24, 690),
            line('敏捷162', 326, 690),
            line('法伤697', 24, 740),
            line('潜能0', 326, 740),
            line('法防697', 24, 790),
            ...[
                '攻击资质1616',
                '防御资质1327',
                '体力资质5417',
                '法力资质1317',
                '速度资质1327',
                '躲闪资质1339',
                '寿命4385',
                '成长1.264',
                '五行土',
            ].map((value, i) => line(value, 780, 220 + i * 46, 380)),
        ];
        const result = parse(lines, rules, lines[2]);
        expect(result.patch).toMatchObject({
            name: '远山',
            level: 139,
            growth: '1.264',
            life: 4385,
            element: '土',
            quality: { attack: 1616, defense: 1327, hp: 5417, mp: 1317, speed: 1327, dodge: 1339 },
        });
        expect(result.patch.attrs).toHaveLength(7);
        expect(result.patch.attrs?.find((one) => one.label === '魔法')?.value).toBe('931');
        expect(result.patch.attrs?.find((one) => one.label === '攻击')?.value).toBe('2016');
        expect(result.patch.points).toContainEqual({ label: '潜能', value: '0' });
    });

    it('分框标签就近配对，同行多标签不吞掉后面的加点', () => {
        const result = parse(
            [
                line('气血', 0, 0, 45),
                line('4238/4238', 90, 0),
                line('体质', 326, 0, 45),
                line('440', 395, 0),
                line('攻击2016力量763', 0, 50, 450),
                line('攻 击 资 质', 780, 100, 180),
                line('1616', 990, 100),
            ],
            rules,
        );
        expect(result.patch.attrs).toEqual([
            { label: '气血', value: '4238' },
            { label: '攻击', value: '2016' },
        ]);
        expect(result.patch.points).toEqual([
            { label: '体质', value: '440' },
            { label: '力量', value: '763' },
        ]);
        expect(result.patch.quality).toEqual({ attack: 1616 });
    });

    it('多只宠物缺少选中态时不猜第一只，资质单图不会改写战斗属性', () => {
        const result = parse(
            [
                line('139级', 110, 100),
                line('123级', 110, 200),
                line('攻击2016', 24, 490),
                line('攻击资质1616', 780, 220),
            ],
            rules,
        );
        expect(result.patch.level).toBeUndefined();
        expect(parse([line('攻击资质1616', 0, 0)], rules).patch.attrs).toEqual([]);
    });

    it('重识别整只覆盖，旧技能、资质和漏项不混入新兽，取消不改原对象', () => {
        const base = {
            ...emptyPet(),
            name: '手填',
            portrait: 'pet-2076',
            points: [{ label: '力量', value: '763' }],
            attrs: [{ label: '攻击', value: '2016' }],
            skills: ['高级必杀', '连击'],
            innerPills: ['旧内丹'],
            level: 139,
            life: 4385,
            growth: '1.264',
            element: '土',
            quality: { ...emptyPet().quality, defense: 1327 },
        };
        const next = applyPetPanel(base, {
            patch: { quality: { attack: 1616 }, skills: ['高级必杀', '吸血', '吸血'] },
            hit: 3,
            skillCount: 2,
        });
        expect(next.skills).toEqual(['高级必杀', '吸血']);
        expect(next.attrs).toEqual([]);
        expect(next.points).toEqual([]);
        expect(next.quality.defense).toBe(0);
        expect(next).toMatchObject({
            name: '手填',
            portrait: '',
            level: 0,
            life: 0,
            growth: '',
            element: '',
            innerPills: [],
        });
        expect(base.quality.attack).toBe(0);
        expect(base.skills).toEqual(['高级必杀', '连击']);
        expect(normalizePet(JSON.parse(JSON.stringify(next)))).toEqual(next);
    });

    it('连续截图不累加；识别失败保留当前草稿，新结果与解析结果相互隔离', () => {
        const first = applyPetPanel(emptyPet(), {
            patch: { name: '新兽', attrs: [{ label: '攻击', value: '601' }], skills: ['泰山压顶'] },
            hit: 3,
            skillCount: 1,
        });
        const result = {
            patch: { points: [{ label: '潜能', value: '0' }] },
            hit: 1,
            skillCount: 0,
        };
        const second = applyPetPanel(first, result);
        expect(second.name).toBe('新兽');
        expect(second.skills).toEqual([]);
        expect(second.attrs).toEqual([]);
        expect(second.points).toEqual([{ label: '潜能', value: '0' }]);
        second.points![0].value = '1';
        expect(result.patch.points[0].value).toBe('0');
        expect(first.skills).toEqual(['泰山压顶']);
        expect(applyPetPanel(first, { patch: {}, hit: 0, skillCount: 0 })).toBe(first);
    });
});
