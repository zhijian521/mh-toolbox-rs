import { setup, pets, cleanup } from './characters/crud.mjs';
import { ocr } from './characters/ocr.mjs';
import { quick } from './characters/quick.mjs';

export default async function run(ctx) {
    if (!ctx.want('角色')) return;
    await setup(ctx);
    await ocr(ctx);
    await pets(ctx);
    await quick(ctx);
    await cleanup(ctx);
}
