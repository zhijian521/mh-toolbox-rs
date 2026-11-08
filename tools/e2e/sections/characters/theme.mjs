export async function checkButtonTheme({ cdp, t, sleep }, selector, characterName = 'E2E改名后') {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
    await sleep(180);
    const palette = await cdp.evaluate(`(() => {
        const panel = document.querySelector(${JSON.stringify(selector)});
        const card = [...document.querySelectorAll('.roster .char')]
            .find((one) => one.querySelector('h2')?.textContent === ${JSON.stringify(characterName)});
        const reference = card?.querySelector('.head-actions .press-btn-tile');
        if (!panel || !reference) return null;
        const buttons = [...panel.querySelectorAll('.press-btn:not(.seal)')]
            .filter((button) => button.offsetParent !== null && !button.closest('.gear-add'));
        return {
            schoolMatches: panel.getAttribute('data-school') === card.getAttribute('data-school'),
            expected: getComputedStyle(reference).backgroundColor,
            colors: buttons.map((button) =>
                getComputedStyle(button.querySelector('.press-btn-tile')).backgroundColor),
            seal: panel.querySelector('.seal .press-btn-tile') &&
                getComputedStyle(panel.querySelector('.seal .press-btn-tile')).backgroundColor,
        };
    })()`);
    t.check(
        `${selector} 的普通按钮与角色卡同色，保存按钮保留朱色`,
        Boolean(
            palette?.schoolMatches &&
            palette.colors.length > 0 &&
            palette.colors.every((color) => color === palette.expected) &&
            palette.seal &&
            palette.seal !== palette.expected,
        ),
        JSON.stringify(palette),
    );
}
