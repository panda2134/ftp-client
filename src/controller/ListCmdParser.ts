import DateParser from 'date-and-time'

export interface IListFileInfo {
    filename: string;
    identifier?: string;
    lastModified?: Date;
    type?: 'file' | 'directory';
    size?: number;
    permission?: string; // string of 3 octal digits
}

interface IListParser {
    format: string;
    parse: (lines: string[]) => IListFileInfo[] | undefined;
}

export const EPLFParser: IListParser = {
    format: 'EPLF',
    parse (lines): IListFileInfo[] | undefined {
        if (!lines.length) return
        const parts = lines[0].split('\t')
        if (parts.length !== 2) return

        const ret: IListFileInfo[] = []
        for (const line of lines) {
            const [attrStr, filename] = line.split('\t')
            const info: IListFileInfo = { filename }
            if (attrStr[0] !== '+') continue
            attrStr.substr(1).split(',').filter(x => x.length)
                .forEach((attr) => {
                    if (attr.startsWith('r'))
                        info.type = 'file'
                    else if (attr.startsWith('/'))
                        info.type = 'directory'
                    else if (attr.startsWith('s'))
                        info.size = parseInt(attr.substr(1))
                    else if (attr.startsWith('m'))
                        info.lastModified = new Date(1000 * parseInt(attr.substr(1)))
                    else if (attr.startsWith('i'))
                        info.identifier = attr.substr(1)
                    else if (attr.startsWith('up'))
                        info.permission = attr.substr(2)
                })
            ret.push(info)
        }
        return ret
    }
}

export const MSDOSParser: IListParser = {
    format: 'MS-DOS',
    parse (lines): IListFileInfo[] | undefined {
        if (!lines.length) return
        const parts = lines[0].split(' ').filter(x => x.length)
        if (parts.length !== 4) return

        const ret: IListFileInfo[] = []
        lines.forEach((line) => {
            const splitted = line.split(' ').filter(x => x.length)
            if (splitted.length !== 4) return
            const [date, time, sizeOrDir, filename] = splitted
            const info: IListFileInfo = {
                filename,
                lastModified: DateParser.parse(
                    date + ' ' + time,
                    'MM-DD-YYYY hh:mmA'
                )
            }
            if (sizeOrDir === '<DIR>') {
                info.type = 'directory'
            } else {
                info.type = 'file'
                info.size = parseInt(sizeOrDir)
            }
            ret.push(info)
        })
        return ret
    }
}

export const UNIXParser: IListParser = {
    format: 'UNIX',
    parse (lines): IListFileInfo[] | undefined {
        if (!lines.length) return
        const parts = lines[0].split(' ').filter(x => x.length)
        if (parts.length !== 9) return

        const ret: IListFileInfo[] = []
        lines.forEach((line) => {
            const splitted = line.split(' ').filter(x => x.length)
            if (splitted.length !== 9) return
            const info: IListFileInfo = {
                filename: splitted[8],
                type: splitted[0][0] === 'd' ? 'directory' : 'file',
                size: parseInt(splitted[4])
            }
            // parse permissions
            const perms = splitted[0].substr(1)
            if (perms.length === 9) {
                const processPermMask = (start: number) => {
                    const bitmask = Array.from(perms.substr(start, 3)).map(x => x !== '-' ? 1 : 0).join('')
                    return String(parseInt(bitmask, 2))
                }
                info.permission = processPermMask(0) + processPermMask(3) + processPermMask(6)
            }
            // detect date; 2 formats
            const dateTime = splitted.slice(5, 8).join(' ')
            if (splitted[7].match(/^\d\d\d\d$/)) {
                // before the current year
                info.lastModified = DateParser.parse(dateTime, 'MMM DD YYYY')
            } else {
                // current year
                info.lastModified = DateParser.parse(dateTime, 'MMM DD HH:mm')
                info.lastModified.setUTCFullYear(new Date().getUTCFullYear())
            }

            ret.push(info)
        })
        return ret
    }
}

export default function tryParse(lines: string[]): [IListFileInfo[], string] | undefined {
    const parsers = [EPLFParser, UNIXParser, MSDOSParser]
    for (const parser of parsers) {
        const res = parser.parse(lines)
        if (res?.length) {
            return [res, parser.format]
        }
    }
    return undefined
}