import { lifeSkills, storySkills } from '../../../services/game-data';
import { assistIcon } from '../../../services/game-icons';
import { ocrFrame } from '../../../services/ocr';
import type { OcrLine } from './attr-panel';
import { readAssistLevels } from './assist-image';
import { parseAssistPanel } from './assist-panel';
import { matchIcons, type IconHit } from './matcher';
import { base64Of, swapToBgra } from './pixels';

/** 同一原图复用匹配与识别结果；缓存原始结果，手动修改不写进缓存。 */
export function createAssistReader() {
    const cache = new WeakMap<ImageData, Promise<{ icons: IconHit[]; lines: OcrLine[] }>>();
    return async (image: ImageData) => {
        let pending = cache.get(image);
        if (!pending) {
            pending = (async () => {
                const candidates = [
                    ...lifeSkills().map((name) => ({ name, url: assistIcon(name, 'life') })),
                    ...storySkills().map((name) => ({ name, url: assistIcon(name, 'story') })),
                ].filter((one): one is { name: string; url: string } => Boolean(one.url));
                const icons = await matchIcons(image, candidates);
                let lines = icons.length ? await readAssistLevels(image, icons) : [];
                if (parseAssistPanel(lines, icons).rows.some((row) => row.state === 'miss')) {
                    const whole = await ocrFrame(
                        base64Of(swapToBgra(image.data)),
                        image.width,
                        image.height,
                    );
                    if (whole.status === 'failed') throw new Error(whole.error);
                    lines = [...lines, ...whole.lines];
                }
                return { icons, lines };
            })().catch((error) => {
                cache.delete(image);
                throw error;
            });
            cache.set(image, pending);
        }
        const { icons, lines } = await pending;
        return parseAssistPanel(lines, icons);
    };
}
