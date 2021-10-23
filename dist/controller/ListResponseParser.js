"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const EPLFParser = {
    format: 'EPLF',
    tryParse(lines) {
        if (!lines.length)
            return;
        const parts = lines[0].split('\t');
        if (parts.length !== 2)
            return;
        const ret = [];
        for (const line of lines) {
            const [attrStr, filename] = line.split('\t');
            const info = { filename };
            attrStr.split(',').filter(x => x.length)
                .forEach((attr) => {
                if (attr.startsWith('r'))
                    info.type = 'file';
                else if (attr.startsWith('/'))
                    info.type = 'directory';
                else if (attr.startsWith('s'))
                    info.size = parseInt(attr.substr(1));
                else if (attr.startsWith('m'))
                    info.lastModified = new Date(1000 * parseInt(attr.substr(1)));
                else if (attr.startsWith('i'))
                    info.identifier = attr.substr(1);
                else if (attr.startsWith('up'))
                    info.permission = attr.substr(2);
            });
            ret.push(info);
        }
        return ret;
    }
};
//# sourceMappingURL=ListResponseParser.js.map