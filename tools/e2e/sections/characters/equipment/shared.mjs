import { importLoaded } from '../../../cdp.mjs';
import { uploadFixtureFiles } from '../screenshot.mjs';

/** 每轮装备场景共用上传计数，批量识别按张数保留等待预算。 */
export function createEquipmentTools(ctx) {
    const { cdp, ui } = ctx;
    const readGear = () =>
        cdp.evaluate(`(async () => {
        const { useRoster } = await ${importLoaded('/src/views/characters/roster.ts')};
        return JSON.parse(JSON.stringify(useRoster().roster.value.find((one) => one.name === 'E2E改名后').gear));
    })()`);
    let uploadCount = 1;
    const upload = (selector, samples) => {
        uploadCount = samples.length;
        return cdp.evaluate(`(async () => {
        const transfer = new DataTransfer();
        for (const rows of ${JSON.stringify(samples)}) {
            const canvas = document.createElement('canvas');
            canvas.width = 440; canvas.height = rows.length * 34 + 28;
            const paint = canvas.getContext('2d');
            paint.fillStyle = '#403420'; paint.fillRect(0, 0, canvas.width, canvas.height);
            paint.font = '22px "Microsoft YaHei"';
            rows.forEach((text, index) => {
                paint.fillStyle = text.includes('[') && !text.startsWith('[装备') && !text.startsWith('[灵饰') ? '#00ff00' : '#ffff00';
                paint.fillText(text, 20, 30 + index * 34);
            });
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
            transfer.items.add(new File([blob], rows[0] + '.png', { type: 'image/png' }));
        }
        const input = document.querySelector(${JSON.stringify(selector)});
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    };
    const uploadFixtures = (names) => {
        uploadCount = names.length;
        return uploadFixtureFiles(cdp, '.gear-editor .upload-file', names);
    };
    const head = (defense) => [
        '水晶帽',
        '[装备条件] 等级60',
        '等级60',
        '魔法+60 防御+' + defense,
        '耐久度191',
        '套装效果：附加状态碎星诀',
    ];
    const waitUpload = async (allowFailures = false) => {
        // 批量截图串行识别，每张保留单图预算；不能在四张尚未完成时就读取表单。
        const completed = await ui.waitFor(
            `document.querySelector('.gear-upload')?.getAttribute('aria-busy') === 'false' &&
            document.querySelector('.gear-upload .upload-status')?.textContent.includes('已填入')`,
            { timeout: 45000 * uploadCount },
        );
        return completed && (allowFailures || !(await ui.exists('.gear-upload .upload-error')));
    };
    const openHead = () =>
        ui.clickIn('.roster .char', 'E2E改名后', { label: '快速修改 头 · 水晶帽' });
    return { readGear, upload, uploadFixtures, head, waitUpload, openHead };
}
