"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.load = load;
const typedoc_1 = require("typedoc");
const hider = (function hider() {
    // remove property sections and navigation links associated with doscScriptRunner
    // document.querySelector('a#______')?.closest('.tsd-panel.tsd-member')?.remove();
    // [...document.querySelectorAll('a[href$="#______"]')].forEach((elem) => elem.remove());
    // remove interface signature and GitHub source
    if (window.location.pathname.includes(`2_animationEffects_libraryPresetBanks`)) {
        document.querySelector('.col-content > .tsd-signature')?.remove();
        document.querySelector('.col-content > .tsd-sources')?.remove();
    }
    // for each member
    const members = [...document.querySelectorAll('.tsd-panel.tsd-member')];
    for (const member of members) {
        // remove member signature
        member.querySelector(':scope > .tsd-signature')?.remove();
        // remove signatures of objects returned by generator functions
        member.querySelector(':scope h5 + ul.tsd-parameters')?.remove();
        const h5List = [...member.querySelectorAll(':scope h5')];
        for (const h5 of h5List) {
            h5.classList.add('custom-color');
        }
        // remove return title for objects returned by generator functions
        member.querySelector('.tsd-returns-title')?.remove();
        // remove duplicate list of config objects' properties
        member.querySelector(':scope li.tsd-parameter ul.tsd-parameters:has(> li.tsd-parameter > h5')?.remove();
    }
}).toString();
function load(app) {
    // todo: Add event listeners to app, app.converter, etc.
    // this function may be async
    app.renderer.hooks.on('body.end', () => {
        return typedoc_1.JSX.createElement(typedoc_1.JSX.Raw, { html: /* html */ `
        <script>
          ${hider}
          window.addEventListener('load', hider);
        </script>
        ` });
    });
}
