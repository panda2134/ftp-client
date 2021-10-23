import {deepStrictEqual, equal} from 'assert'
import {EPLFParser, IListFileInfo, MSDOSParser, UNIXParser} from './ListCmdParser'

describe('EPLF Parsing', () => {
    it("should have a correct format", () => {
        equal(EPLFParser.format, 'EPLF')
    })
    it("should be able to parse a valid EPLF response", () => {
        const lines = [
            '+i8388621.48594,m825718503,r,s280,up644\tdjb.html',
            '+i8388621.50690,m824255907,/,up755\t514',
            '+i8388621.48598,m824253270,r,s612,up644\t514.html'
        ]
        const actual = EPLFParser.parse(lines)
        const expected: IListFileInfo[] = [
            { filename: 'djb.html', lastModified: new Date(825718503 * 1000),
              size: 280, permission: '644', identifier: '8388621.48594', type: 'file'},
            { filename: '514', lastModified: new Date(824255907 * 1000),
                permission: '755', identifier: '8388621.50690', type: 'directory'},
            { filename: '514.html', lastModified: new Date(824253270 * 1000),
                size: 612, permission: '644', identifier: '8388621.48598', type: 'file'},
        ]
        deepStrictEqual(actual, expected)
    })
    it("should omit illegal lines",() => {
        const lines = [
            '+i8388621.48594,m825718503,r,s280,up644\tdjb.html',
            'asdf',
            '+i8388621.50690,m824255907,/,up755\t514',
            'i8388621.48598,m824253270,r,s612,up644\t514.html'
        ]
        const actual = EPLFParser.parse(lines)
        const expected: IListFileInfo[] = [
            { filename: 'djb.html', lastModified: new Date(825718503 * 1000),
                size: 280, permission: '644', identifier: '8388621.48594', type: 'file'},
            { filename: '514', lastModified: new Date(824255907 * 1000),
                permission: '755', identifier: '8388621.50690', type: 'directory'},
        ]
        deepStrictEqual(actual, expected)
    })
    it("should reject if the 1st line is not EPLF", () => {
        equal(EPLFParser.parse(['aaa']), undefined)
    })
})

describe('MS-DOS Parsing', () => {
    it('should have a correct format', () => {
        equal(MSDOSParser.format, 'MS-DOS')
    })
    it('should be able to parse a MSDOS DIR response', () => {
        const lines = [
            '10-19-2021  05:58AM       <DIR>          test_dir',
            '10-18-2021  02:03AM              3265744 VNC-Viewer-6.21.406-MacOSX-x86_64.dmg',
            '10-18-2021  02:04AM             57906084 ???????.pdf'
        ]
        const actual = MSDOSParser.parse(lines)
        const expected: IListFileInfo[] = [
            { filename: 'test_dir',
                type: 'directory',
                lastModified: new Date('2021-10-18T21:58:00.000Z')},
            { filename: 'VNC-Viewer-6.21.406-MacOSX-x86_64.dmg',
                type: 'file',
                size: 3265744,
                lastModified: new Date('2021-10-17T18:03:00.000Z')},
            { filename: '???????.pdf',
                type: 'file',
                size: 57906084,
                lastModified: new Date('2021-10-17T18:04:00.000Z')}
        ]
        deepStrictEqual(actual, expected)
    })
    it('should reject illigal lines', () => {
        const lines = [
            '10-19-2021  05:58AM       <DIR>          test_dir',
            '10-18-2021  02:03AM              3265744 VNC-Viewer-6.21.406-MacOSX-x86_64.dmg',
            '10-18-2021  02:04AM      aaa       57906084 ???????.pdf'
        ]
        const actual = MSDOSParser.parse(lines)
        const expected: IListFileInfo[] = [
            { filename: 'test_dir',
                type: 'directory',
                lastModified: new Date('2021-10-18T21:58:00.000Z')},
            { filename: 'VNC-Viewer-6.21.406-MacOSX-x86_64.dmg',
                type: 'file',
                size: 3265744,
                lastModified: new Date('2021-10-17T18:03:00.000Z')},
        ]
        deepStrictEqual(actual, expected)
    })
    it('should reject lines with the first line not conforming to MS-DOS format', () => {
        const lines = [
            '10-18-2021  02:04AM      aaa       57906084 ???????.pdf',
            '10-19-2021  05:58AM       <DIR>          test_dir',
            '10-18-2021  02:03AM              3265744 VNC-Viewer-6.21.406-MacOSX-x86_64.dmg'
        ]
        equal(MSDOSParser.parse(lines), undefined)
    })
})

describe('UNIX Parsing', () => {
    it('should have a correct format', () => {
        equal(UNIXParser.format, 'UNIX')
    })
    it('should parse LIST of files in the current year', () => {
        const lines = [
            '-rw-r--r--    1 ftp      ftp             0 Oct 17 14:09 SEE_PUB_FOLDER',
            'drwxr-xr-x    7 ftp      ftp          4096 Oct 19 13:42 pub'
        ]
        const actual = UNIXParser.parse(lines)
        const currentYear = (new Date()).getUTCFullYear()
        const expected: IListFileInfo[] = [
            {
                filename: 'SEE_PUB_FOLDER', type: 'file', permission: '644',
                size: 0, lastModified: new Date(`${currentYear}-10-17T06:09:00Z`)
            },
            {
                filename: 'pub', type: 'directory', permission: '755',
                size: 4096, lastModified: new Date(`${currentYear}-10-19T05:42:00Z`)
            }
        ]
        deepStrictEqual(actual, expected)
    })
    it('should parse LIST of files in the past years', () => {
        const lines = [
            'dr-xr-xr-x   60 0        25010          68 Nov 19  2019 pub',
            '-rw-r--r--    1 0        26             26 Nov 21  2006 robots.txt',
            'dr-xr-xr-x    3 0        12              3 Aug 20  1998 usr'
        ]
        const actual = UNIXParser.parse(lines)
        const expected: IListFileInfo[] = [
            {
                filename: 'pub', type: 'directory', permission: '555',
                size: 68, lastModified: new Date('2019-11-18T16:00:00Z')
            },
            {
                filename: 'robots.txt', type: 'file', permission: '644',
                size: 26, lastModified: new Date('2006-11-20T16:00:00Z')
            },
            {
                filename: 'usr', type: 'directory', permission: '555',
                size: 3, lastModified: new Date('1998-08-19T16:00:00Z')
            },
        ]
        deepStrictEqual(actual, expected)
    })
    it('should reject lines with the first line not conforming to UNIX format', () => {
        const lines = [
            'dr-xr-xr-x   60 0    aaaaaaaaa     25010          68 Nov 19  2019 pub',
            '-rw-r--r--    1 0        26             26 Nov 21  2006 robots.txt',
            'dr-xr-xr-x    3 0        12              3 Aug 20  1998 usr'
        ]
        equal(UNIXParser.parse(lines), undefined)
    })
})

