/** 把角色页的只读组件导出为 PNG，保留实际字体、图标和排版。 */
import { toSvg } from 'html-to-image';
import { nextTick } from 'vue';
import { loadEquipmentNames } from '../../services/game-data';
import { loadPetAssets } from '../../services/pet-assets';
import type { ReadonlyCharacter } from './character';

const MAX_SIDE = 16_384;

export async function renderCharacterShare(sheet: HTMLElement, character: ReadonlyCharacter) {
    await Promise.allSettled([
        character.gear.length && loadEquipmentNames(),
        character.pets.length && loadPetAssets(),
        document.fonts.ready,
    ]);
    await nextTick();
    await Promise.allSettled(
        Array.from(sheet.querySelectorAll('img'), (image) => {
            image.loading = 'eager';
            return image.decode();
        }),
    );
    await nextTick();
    if (!sheet.isConnected) throw new Error('角色页面已关闭');
    const side = Math.max(sheet.offsetWidth, sheet.offsetHeight);
    if (side > MAX_SIDE) throw new Error('角色资料超出单张图片的尺寸上限');
    const svg = await toSvg(sheet, {
        preferredFontFormat: 'woff2',
        // Vue 模板里的分隔注释可能含有 XML 不接受的连续连字符。
        filter: (node) => node.nodeType !== Node.COMMENT_NODE,
    });
    const source = new Image();
    await new Promise<void>((resolve, reject) => {
        source.onload = () => resolve();
        source.onerror = () => reject(new Error('无法绘制角色卡片'));
        source.src = svg;
    });
    const canvas = document.createElement('canvas');
    const scale = Math.min(2, MAX_SIDE / side);
    canvas.width = Math.ceil(source.naturalWidth * scale);
    canvas.height = Math.ceil(source.naturalHeight * scale);
    try {
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('无法创建图片画布');
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
        if (!image) throw new Error('无法生成 PNG 图片');
        if (image.size > 32 * 1024 * 1024) throw new Error('分享图片超过 32 MB');
        return image;
    } finally {
        canvas.width = canvas.height = 0;
    }
}
