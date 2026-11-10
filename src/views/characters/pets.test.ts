import { describe, expect, it } from 'vitest';
import { hasPetName, PET_SKILL_SLOTS, petDetailSlots } from './pets';
import { normalizePet } from './details';

describe('召唤兽详情与旧档案', () => {
    it('整体和单只修改都拒绝空白名称，保存时去掉首尾空格', () => {
        expect(hasPetName({ name: '' })).toBe(false);
        expect(hasPetName({ name: ' \t ' })).toBe(false);
        expect(hasPetName({ name: ' 天狗 ' })).toBe(true);
        expect(normalizePet({ name: ' \t ' })).toBeNull();
        expect(normalizePet({ name: ' 天狗 ' })?.name).toBe('天狗');
    });

    it('超过默认格数的技能完整展示，不截断原记录', () => {
        const names = Array.from({ length: 16 }, (_, i) => `技能${i + 1}`);
        expect(petDetailSlots(names, PET_SKILL_SLOTS)).toEqual(names);
        expect(petDetailSlots(['连击'], 3)).toEqual(['连击', '', '']);
        expect(names).toHaveLength(16);
    });
    it('旧档案缺少头像和加点时安全兜底，不删除旧内丹记录', () => {
        expect(normalizePet({ name: '旧兽', innerPills: ['狂怒'], spirit: 110 })).toMatchObject({
            portrait: '',
            points: [],
            innerPills: ['狂怒'],
            spirit: 110,
        });
    });
    it('脏加点不影响其余记录，零值不会丢失', () => {
        expect(
            normalizePet({
                name: '兽',
                points: [null, { value: '坏行' }, { label: '潜能', value: '0' }],
            })?.points,
        ).toEqual([{ label: '潜能', value: '0' }]);
    });
});
