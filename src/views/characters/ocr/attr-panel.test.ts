import { describe, expect, it, vi } from 'vitest';
import { applyAttrPanel, parseAttrPanel, type OcrField, type OcrLine } from './attr-panel';
import { emptyCharacter } from '../roster';

/* 「换门派就换技能表」这条约定的出口在 `schools.ts`，而它读的是 `fetch` 回来的真表
 * ——vitest 里没有启动流程，读到的永远是空表。所以把那一个模块换掉：
 * 验的是「换门派时确实去换了技能表」，不验那七项各叫什么（那是 `schools` 自己的测试）。 */
vi.mock('../schools', () => ({
    schoolSkills: (school: string) => [{ name: `${school}·一`, level: 0, cap: 120 }],
}));

/* 测试只关心匹配规则，不复制 21 个门派名——那张表在 `public/game/data/schools.json`，
 * 抄一份到这里，改译名时就多一处要跟着改。 */
const SCHOOLS = ['五庄观', '化生寺', '龙宫'];

/**
 * 属性面板的解析。
 *
 * 手写坐标按深蓝「人物属性」面板组织，覆盖分框、缩放、漏字与局部写回规则。
 */

/** 造一行。默认宽高按 14px 字估，分数 0.95（正常识别）。 */
function line(text: string, x: number, y: number, score = 0.95): OcrLine {
    return { text, x, y, width: text.length * 14, height: 16, score };
}

/** 按「一行里几个格子」排：`y` 递增 20，`x` 从 20 起每格 90。 */
function rowsOfCells(rows: string[][], options: { score?: number } = {}): OcrLine[] {
    const lines: OcrLine[] = [];
    rows.forEach((row, rowIndex) => {
        row.forEach((text, cellIndex) => {
            lines.push(line(text, 20 + cellIndex * 90, 20 + rowIndex * 20, options.score ?? 0.95));
        });
    });
    return lines;
}

function fieldOf(fields: readonly OcrField[], key: string): OcrField {
    const found = fields.find((one) => one.key === key);
    if (!found) throw new Error(`没有 ${key} 这一项`);
    return found;
}

describe('属性面板：深蓝人物属性', () => {
    /* 深蓝版式（2026-11-07 第一张图）：名称在前、等级在后；下半部是
     * 「气血」一整行、「魔法 / 活力」并排，一直到最后一行「经验 当前/所需」。 */
    const dark = rowsOfCells([
        ['名称', '归岚', '等级', '130'],
        ['称谓', '', '人气', '757'],
        ['帮派', '大唐芙蓉园', '帮贡', '334'],
        ['门派', '五庄观', '门贡', '324'],
        ['气血', '3916/3916/3916'],
        ['魔法', '1440/1440', '活力', '602/860'],
        ['愤怒', '102/150', '体力', '313/900'],
        ['命中', '1915', '体质', '229'],
        ['伤害', '1591', '魔力', '145'],
        ['防御', '826', '力量', '721'],
        ['速度', '455', '耐力', '153'],
        ['法伤', '810', '敏捷', '332'],
        ['法防', '723', '潜力', '0'],
        ['经验', '39686092/14142174'],
    ]);

    it('认出全部字段，值一个不错', () => {
        const { fields, hit } = parseAttrPanel(dark, { schools: SCHOOLS });
        expect(hit).toBe(24);
        expect(fieldOf(fields, 'name').value).toBe('归岚');
        expect(fieldOf(fields, 'level').value).toBe('130');
        expect(fieldOf(fields, 'school').value).toBe('五庄观');
        expect(fieldOf(fields, 'guild').value).toBe('大唐芙蓉园');
        expect(fieldOf(fields, '人气').value).toBe('757');
        expect(fieldOf(fields, '帮贡').value).toBe('334');
        expect(fieldOf(fields, '门贡').value).toBe('324');
        expect(fieldOf(fields, '命中').value).toBe('1915');
        expect(fieldOf(fields, '敏捷').value).toBe('332');
    });

    /* 资源四行取**上限**：面板写「当前/上限」，卡上记的是上限（老数据里
     * `活力 860`、`体力 900` 都是这个口径）。 */
    it('资源四行取上限，不取当前值', () => {
        const { fields } = parseAttrPanel(dark, { schools: SCHOOLS });
        expect(fieldOf(fields, '气血').raw).toBe('3916/3916/3916');
        expect(fieldOf(fields, '气血').value).toBe('3916');
        expect(fieldOf(fields, '活力').value).toBe('860');
        expect(fieldOf(fields, '体力').value).toBe('900');
    });

    /* 经验的原始数是八位数，交出去时**换成「万」**（`asWan`）：卡上历来记万，
     * 同一个号在这两处不该一个写 `39686092`、一个写 `3,968.6万`。 */
    it('「经验 当前/所需」拆成两项，并换成万', () => {
        const { fields } = parseAttrPanel(dark, { schools: SCHOOLS });
        expect(fieldOf(fields, 'expValue').value).toBe('3968.6万');
        expect(fieldOf(fields, 'expNeed').value).toBe('1414.2万');
        /* 原文留着八位数：「为什么是这个值」要能对回面板上那一格
         * （一行两个数在拆分时已各自成 raw，斜杠不留）。 */
        expect(fieldOf(fields, 'expValue').raw).toBe('39686092');
    });
});

/* 经验的单位：面板给原始数，卡上历来记「万」。这一段的每一条都是「不要多转一次」。 */
describe('经验换成万', () => {
    const valueOf = (text: string) => {
        const { fields } = parseAttrPanel(rowsOfCells([['经验', text]]));
        return fieldOf(fields, 'expValue').value;
    };

    it('千万级的原始数换成万，保留一位小数', () => {
        expect(valueOf('39686092')).toBe('3968.6万');
        expect(valueOf('14142174')).toBe('1414.2万');
    });

    it('整万不留 .0', () => {
        expect(valueOf('20000000')).toBe('2000万');
    });

    it('不到一万的留着原样：0.4万 比 3968 难读', () => {
        expect(valueOf('3968')).toBe('3968');
    });

    it('面板自己写了万，就不乘除第二遍', () => {
        expect(valueOf('4,281.1万')).toBe('4,281.1万');
    });
});

describe('属性面板：认不清的时候', () => {
    it('标签与值被读成一格时也能拆开', () => {
        const lines = [
            line('名称归岚', 20, 20),
            line('等级130', 200, 20),
            line('气血3916/3916', 20, 40),
            line('命中1915', 20, 60),
        ];
        const { fields } = parseAttrPanel(lines);
        expect(fieldOf(fields, 'name').value).toBe('归岚');
        expect(fieldOf(fields, 'level').value).toBe('130');
        expect(fieldOf(fields, '气血').value).toBe('3916');
        expect(fieldOf(fields, '命中').value).toBe('1915');
    });

    it('数字里混了字母：按形状纠正，但整项标成存疑', () => {
        const lines = [line('帮贡', 20, 20), line('33A', 90, 20)];
        const { fields } = parseAttrPanel(lines);
        // A 不在纠正表里，取数字段拿到的仍是 33——值对得上，但原文有字母，不能当「确定」。
        expect(fieldOf(fields, '帮贡').value).toBe('33');
        expect(fieldOf(fields, '帮贡').state).toBe('guess');
    });

    it('O / l 这种形状明确的错字直接纠正', () => {
        const lines = [line('速度', 20, 20), line('45O', 90, 20)];
        const { fields } = parseAttrPanel(lines);
        expect(fieldOf(fields, '速度').value).toBe('450');
    });

    it('门派只认到一半时按包含关系补全，并标存疑', () => {
        const lines = [line('门派', 20, 20), line('五庄', 90, 20)];
        const { fields } = parseAttrPanel(lines, { schools: SCHOOLS });
        expect(fieldOf(fields, 'school').value).toBe('五庄观');
        expect(fieldOf(fields, 'school').state).toBe('guess');
    });

    it('门派表里没有的名字不写进卡片', () => {
        const lines = [line('门派', 20, 20), line('不存在派', 90, 20)];
        const { fields } = parseAttrPanel(lines, { schools: SCHOOLS });
        expect(fieldOf(fields, 'school').state).toBe('bad');

        const card = applyAttrPanel(emptyCharacter(), fields);
        expect(card.school).not.toBe('不存在派');
    });

    /* 2026-11-07 那张真面板上「门贡」被读成「门责」：同一行里其它字都是 0.99+，
     * 只有它是 0.80。形近字纠正就是为了这一格。 */
    it('「门责」按形近字认回「门贡」', () => {
        const lines = [line('门责', 20, 20), line('324', 90, 20)];
        const { fields } = parseAttrPanel(lines);
        expect(fieldOf(fields, '门贡').value).toBe('324');
    });

    it('标签被切掉后半截时，只认唯一的那一个', () => {
        const lines = [
            line('速度', 20, 20),
            line('455', 90, 20),
            line('耐', 200, 20),
            line('153', 260, 20),
        ];
        const { fields } = parseAttrPanel(lines);
        expect(fieldOf(fields, '速度').value).toBe('455');
        expect(fieldOf(fields, '耐力').value).toBe('153');
    });

    it('半截标签能对上两个时一个都不认，宁可漏也不写错行', () => {
        // 「体」同时是「体质」与「体力」的开头；猜错就会把体力写进体质。
        const lines = [line('体', 20, 20), line('100', 90, 20)];
        const { fields } = parseAttrPanel(lines);
        expect(fieldOf(fields, '体质').state).toBe('miss');
        expect(fieldOf(fields, '体力').state).toBe('miss');
    });

    /* 这张图里左边那排竖排页签（「修炼技能」高 54、y 279）与右边「速度」那一行
     * （y 291）中心线只差 6.5px。按中心线分行时，速度会被并进竖排页签那一行、
     * 于是整项读不到——这是 2026-11-07 实测踩到的第一个真 bug。 */
    it('竖排的页签名（高 54）不会把旁边那一行吞掉', () => {
        const lines: OcrLine[] = [
            { text: '修炼技能', x: 7, y: 279, width: 13, height: 54, score: 0.99 },
            { text: '速度', x: 37, y: 291, width: 30, height: 17, score: 0.99 },
            { text: '455', x: 76, y: 293, width: 23, height: 13, score: 0.99 },
            { text: '耐', x: 179, y: 293, width: 13, height: 13, score: 0.99 },
            { text: '153', x: 216, y: 293, width: 23, height: 13, score: 0.99 },
        ];
        const { fields } = parseAttrPanel(lines);
        expect(fieldOf(fields, '速度').value).toBe('455');
        expect(fieldOf(fields, '耐力').value).toBe('153');
    });

    it('没框到的项是 miss，不是空值', () => {
        const { fields } = parseAttrPanel([line('气血', 20, 20), line('3916', 90, 20)]);
        const magic = fieldOf(fields, '魔法');
        expect(magic.state).toBe('miss');
        expect(magic.raw).toBe('');
        expect(magic.value).toBe('');
    });

    it('一张别的面板（一行都对不上）认不出任何字段', () => {
        const lines = [line('潇湘仙雨', 20, 20), line('120', 120, 20)];
        const { hit } = parseAttrPanel(lines);
        expect(hit).toBe(0);
    });

    it('等级不像等级时标 bad', () => {
        const lines = [line('等级', 20, 20), line('9999', 90, 20)];
        const { fields } = parseAttrPanel(lines);
        expect(fieldOf(fields, 'level').state).toBe('bad');
    });

    it('置信度低的行整项降级成存疑', () => {
        const lines = [line('命中', 20, 20, 0.4), line('1915', 90, 20, 0.4)];
        const { fields } = parseAttrPanel(lines);
        expect(fieldOf(fields, '命中').state).toBe('guess');
    });
});

describe('落到卡片上', () => {
    const card = () => {
        const base = emptyCharacter();
        base.name = '老名字';
        base.guild = '老帮派';
        return base;
    };

    it('只写认出来的项，其余原样', () => {
        const lines = rowsOfCells([
            ['名称', '归岚'],
            ['等级', '130'],
            ['人气', '757'],
        ]);
        const { fields } = parseAttrPanel(lines);
        const next = applyAttrPanel(card(), fields);
        expect(next.name).toBe('归岚');
        expect(next.level).toBe(130);
        expect(next.guild).toBe('老帮派');
        expect(
            next.attrGroups.flatMap((group) => group.rows).find((row) => row.label === '人气')
                ?.value,
        ).toBe('757');
    });

    it('换门派时门派技能跟着换（与编辑弹窗同一条规则）', () => {
        const base = card();
        base.school = '化生寺';
        base.skills = [{ name: '大慈大悲', level: 120, cap: 120 }];
        const lines = rowsOfCells([['门派', '五庄观']]);
        const next = applyAttrPanel(base, parseAttrPanel(lines, { schools: SCHOOLS }).fields);
        expect(next.school).toBe('五庄观');
        /* 表被换掉了（`vi.mock` 那个），所以这里看到的是「按新门派重建」的结果。
         * 真正的七项叫什么由 `schools.test.ts` 守，这里只守「有没有去重建」。 */
        expect(next.skills.map((row) => row.name)).toEqual(['五庄观·一']);
        expect(next.skills.some((row) => row.name === '大慈大悲')).toBe(false);
    });

    it('门派没变就不动技能表', () => {
        const base = card();
        base.school = '五庄观';
        base.skills = [{ name: '周易学', level: 100, cap: 120 }];
        const lines = rowsOfCells([['门派', '五庄观']]);
        const next = applyAttrPanel(base, parseAttrPanel(lines, { schools: SCHOOLS }).fields);
        expect(next.skills).toEqual(base.skills);
    });

    it('潜能那两格（乾元丹 / 潜能果）一个字都不动', () => {
        const base = card();
        const potential = base.attrGroups.find((group) => group.title === '潜能');
        expect(potential).toBeTruthy();
        const before = potential!.rows.map((row) => row.value);

        const next = applyAttrPanel(base, parseAttrPanel(rowsOfCells([['气血', '3916']])).fields);
        const after = next.attrGroups.find((group) => group.title === '潜能')!;
        expect(after.rows.map((row) => row.value)).toEqual(before);
    });

    it('认不到的时候整张卡一个字都不变', () => {
        const base = card();
        const next = applyAttrPanel(base, parseAttrPanel([line('潇湘仙雨', 20, 20)]).fields);
        expect(next.name).toBe(base.name);
        expect(next.guild).toBe(base.guild);
        expect(next.level).toBe(base.level);
    });

    it('经验两项分别落位，落到卡上的是万', () => {
        const lines = rowsOfCells([['经验', '39686092/14142174']]);
        const next = applyAttrPanel(card(), parseAttrPanel(lines).fields);
        expect(next.experience.value).toBe('3968.6万');
        expect(next.experience.need).toBe('1414.2万');
    });
});
