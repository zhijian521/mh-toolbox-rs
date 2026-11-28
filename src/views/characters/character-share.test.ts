import { describe, expect, it } from 'vitest';
import { characterShare } from './character-share';
import type { CharacterData } from './character';

const character: CharacterData = {
    id: 'internal-character-id',
    name: '云中客',
    level: 129,
    school: '凌波城',
    server: '生日快乐',
    guild: '私有帮派',
    attrGroups: [{ title: '战斗', rows: [{ label: '伤害', value: '2381' }] }],
    experience: { value: '200万', need: '400万' },
    skills: [{ name: '啸傲', level: 150, cap: 150 }],
    assists: [{ name: '强身术', level: 140, kind: 'life' }],
    trainings: [{ title: '任务修炼', rows: [{ name: '攻击修炼', level: 21 }] }],
    gear: [
        {
            slot: '武器',
            detail: {
                name: '刑天之逆',
                kind: '枪矛',
                level: 130,
                requires: ['五行 木'],
                flavor: '装备说明',
                foot: '制造者：云中客',
                stats: [{ label: '伤害', value: '+490', extra: '+510' }],
                cond: [{ label: '镶嵌宝石', value: '红玛瑙' }],
                lines: [{ label: '特技', value: '破血狂攻' }],
                note: '私人装备备注',
            },
        },
    ],
    gearMeta: { special: '', suit: '', soul: [{ label: '伤害', value: '+8' }] },
    pets: [
        {
            name: '鬼将',
            portrait: 'test-portrait',
            level: 139,
            joinLevel: 105,
            attrs: [{ label: '气血', value: '5100' }],
            points: [{ label: '力量', value: '879' }],
            quality: { attack: 1600, defense: 1520, hp: 4200, mp: 2100, speed: 1400, dodge: 1310 },
            life: 6890,
            growth: '1.277',
            element: '金',
            skills: [
                '高级必杀',
                '高级偷袭',
                '高级连击',
                '高级吸血',
                '高级夜战',
                '高级敏捷',
                '高级幸运',
            ],
            innerPills: ['旧版兼容内丹'],
        },
    ],
};

describe('角色分享长图资料', () => {
    it('把原页签资料直接交给只读卡片，完整保留装备词条和召唤兽技能', () => {
        const share = characterShare(character);
        expect(share.attrGroups).toBe(character.attrGroups);
        expect(share.skills).toBe(character.skills);
        expect(share.assists).toBe(character.assists);
        expect(share.trainings).toBe(character.trainings);
        expect(share.gearMeta).toBe(character.gearMeta);
        expect(share.gear[0].detail?.stats[0].extra).toBe('+510');
        expect(share.pets[0].skills).toEqual(character.pets[0].skills);
        expect(share.pets[0].attrs).toEqual(character.pets[0].attrs);
    });

    it('保留只有短名的旧装备，并跳过空位和只有私人备注的装备', () => {
        const share = characterShare({
            ...character,
            gear: [
                { slot: '武器', caption: '刑天之逆' },
                { slot: '衣服' },
                { slot: '项链', detail: { name: '', kind: '', stats: [], note: '私人装备备注' } },
            ],
        });
        expect(share.gear.map(({ caption }) => caption)).toEqual(['刑天之逆']);
    });

    it('不分享帮派、装备备注、内部编号或旧版兼容内丹', () => {
        const json = JSON.stringify(characterShare(character));
        for (const privateValue of [
            '私有帮派',
            '私人装备备注',
            'internal-character-id',
            '旧版兼容内丹',
        ]) {
            expect(json).not.toContain(privateValue);
        }
    });
});
