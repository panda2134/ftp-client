import {AddressInfo, Server, Socket} from 'net'
import {createReadStream, createWriteStream} from 'fs'
import {stat} from 'fs/promises'
import split2 from 'split2'
import FTPResponseTransformer from './FTPResponseTransformer';
import tryParse, {IListFileInfo} from './ListCmdParser'
import * as path from 'path'
import {equal} from 'assert'
import {EventEmitter} from 'events'
import {ClientState, DataConnectionMode} from "./Enum";

function encodePathname(dirname?: string): string | undefined {
    return dirname ? dirname.replace('\n', '\0') : undefined
}

export class ServerRejectError extends Error {}
export class InvalidStateError extends Error {}

export class FTPClient {
    private _state: ClientState = ClientState.Disconnected
    private _controlConnection = new Socket()
    private _responseStream: FTPResponseTransformer
    private _encoding: BufferEncoding = 'ascii'

    public readonly emitter: EventEmitter = new EventEmitter()
    public activeModeIPv4Address?: string

    getCurrentState(): ClientState {
        return this._state
    }

    constructor(private preferredDataConnectionMode = DataConnectionMode.PassiveConnection) {
        this._controlConnection.setDefaultEncoding(this._encoding) // encoding for write()
        this._responseStream = this._controlConnection
            .pipe(split2(/\n|\r\n?/))
            .pipe(new FTPResponseTransformer())
            .resume()
        this._controlConnection.on('connection', () => { this._state = ClientState.AwaitServerHello })
        this._controlConnection.on('close', () => { this._state = ClientState.Disconnected })
    }

    setDataConnectionMode(newMode: DataConnectionMode): DataConnectionMode {
        return this.preferredDataConnectionMode = newMode
    }

    public connect(host: string, port = 21): Promise<void> {
        return new Promise<void>(
            (resolve, reject) => {
                const serverHelloCallback = (lines: string[]) => {
                    if (lines.at(-1)?.startsWith('220 ')) {
                        this._state = ClientState.Connected
                        this._controlConnection.setDefaultEncoding(this._encoding)
                        resolve()
                    } else {
                        this._state = ClientState.Disconnected
                        this._controlConnection.end()
                        reject()
                    }
                }
                this._responseStream.once('data', serverHelloCallback)
                this._controlConnection.once('error', reject)
                this._controlConnection.connect(port, host)
            }
        )
    }

    private _writeCmd(verb: string, arg?: string): Promise<string[]> {
        if (this._state !== ClientState.Connected)
            throw new InvalidStateError('Client not connected')
        const controlResponse = this._getResponse()
        this.emitter.emit('request', verb, arg)
        this.emitter.emit('log', verb, arg)
        if (arg != null) {
            this._controlConnection.write(verb + ' ' + arg + '\r\n')
        } else {
            this._controlConnection.write(verb + '\r\n')
        }
        return controlResponse
    }

    private _getResponse() {
        return new Promise<string[]>((resolve, reject) => {
            this._responseStream.once('data', (x) => {
                this.emitter.emit('response', x)
                this.emitter.emit('log', x)
                x.length && !x.at(-1).match(/^[45]\d\d /) ? resolve(x) : reject(x)
            })
        });
    }

    private async _writeCmdAndGrabLastLine(verb: string, arg?: string): Promise<string> {
        const lines = await this._writeCmd(verb, arg)
        if (lines.length === 0) {
            throw new ServerRejectError('Empty response received')
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return lines.at(-1)!
    }

    public async login(user = 'anonymous', pass?: string): Promise<void> {
        if (user === 'anonymous') {
            pass = 'anonymous@example.com'
        }
        if (pass == null) {
            throw new Error('Password is undefined')
        }
        await this._writeCmdAndGrabLastLine('USER', user)
        const passResponse = await this._writeCmdAndGrabLastLine('PASS', pass)
        if (! passResponse.startsWith('2')) { // handle ACCT, etc
            throw new ServerRejectError(`Login failed with given password: ${passResponse}`)
        }

        const feat = await this.getFeatures() // TODO: FIXME!!!
        if (feat && feat.indexOf('UTF8') !== -1) {
            this._encoding = 'utf8'
        }
        this._controlConnection.setDefaultEncoding(this._encoding)
    }

    public async quit(): Promise<void> {
        await this._writeCmd('QUIT')
    }

    public async mkdir(dirname: string): Promise<void> {
        await this._writeCmd('MKD', encodePathname(dirname))
    }

    public async chdir(dirname: string): Promise<void> {
        await this._writeCmd('CWD', encodePathname(dirname))
    }

    public async rmdir(dirname: string): Promise<void> {
        await this._writeCmd('RMD', encodePathname(dirname))
    }

    public async deleteFile(dirname: string): Promise<void> {
        await this._writeCmd('DELE', encodePathname(dirname))
    }

    public async renameFile(prevName: string, newName: string): Promise<void> {
        const [prevEncoded, newEncoded] = [prevName, newName].map(encodePathname)
        const lastLineRenameFrom = await this._writeCmdAndGrabLastLine('RNFR', prevEncoded)
        if (lastLineRenameFrom.startsWith('3')) {
            throw new ServerRejectError('3xx expected in RNFR')
        }
        const lastLineRenameTo = await this._writeCmdAndGrabLastLine('RNTO', newEncoded)
        if (lastLineRenameTo.startsWith('2')) {
            throw new ServerRejectError('2xx expected in RNTO')
        }
    }

    public async pwd(): Promise<string> {
        const lastLine = await this._writeCmdAndGrabLastLine('PWD')
        if (! lastLine.startsWith('2')) {
            throw new ServerRejectError('2xx expected in PWD')
        }
        const extractPwdRegExp = /^2\d\d "(.*(?:"".*)*)(?:"$|"[^"])/
        const matchResult = lastLine.match(extractPwdRegExp)
        if (!matchResult) {
            throw new ServerRejectError('Malformed response in PWD')
        }
        const pathThatNeedsProcessing = matchResult[1]
        return pathThatNeedsProcessing.replace('""', '"')
            .replace('\0', '\n')
    }

    public async getSystemInfo(): Promise<string> {
        const lastLine = await this._writeCmdAndGrabLastLine('SYST')

        if (! lastLine.startsWith('2')) {
            throw new ServerRejectError('2xx expected in SYST')
        }
        return lastLine.substr(4)
    }

    public async getFeatures(): Promise<string[] | null> {
        const lines = await this._writeCmd('FEAT')
        if (lines.length === 0) {
            throw new ServerRejectError('Empty response in FEAT')
        }
        const lastLine = lines.at(-1)
        if (! lastLine || lastLine.match(/^[45]/)) {
            return null
        }
        return lines.slice(1, -1).map(x => x.trim())
    }

    private async _executeWithDataConnection<T>
        (callback: (dataConnection: Promise<Socket>) => Promise<T>, connInit?: (conn: Socket) => void): Promise<T> {

        const dataServer = new Server()
        if (this.preferredDataConnectionMode === DataConnectionMode.PassiveConnection || ! this.activeModeIPv4Address) {
            const dataConnection = new Socket()
            const lastLine = await this._writeCmdAndGrabLastLine('PASV')
            const passiveResponseMatchRegExp =
                /^2\d\d [^\d]*(\d{1,3}),(\d{1,3}),(\d{1,3}),(\d{1,3}),(\d{1,3}),(\d{1,3})[^\d]*$/
            const res = lastLine.match(passiveResponseMatchRegExp)
            if (!res || res.length !== 7) {
                throw new ServerRejectError(`Invalid response received with PASV: ${lastLine}`)
            }
            const ipAddr = res.slice(1, 5).join('.')
            const port = (parseInt(res[5]) << 8) | parseInt(res[6])
            if (connInit) connInit(dataConnection)
            await new Promise<void>((resolve) => dataConnection.connect(port, ipAddr, resolve))
            const result = await callback(Promise.resolve(dataConnection))
            await new Promise<void>((resolve) => dataConnection.end(resolve))
            return result
        } else {
            let dataConnection: Socket | undefined = undefined
            equal(this.preferredDataConnectionMode, DataConnectionMode.PortConnection)
            const dataConnectionPromise = new Promise<Socket>(resolve =>
                dataServer.on('connection', x => {
                    if (connInit) connInit(x)
                    dataConnection = x
                    resolve(x)
                })
            )
            await new Promise<void>(resolve => dataServer.listen(0, '0.0.0.0', resolve))
            const addr = dataServer.address() as AddressInfo
            const [p1, p2] = [(addr.port >> 8) & 0xff, addr.port & 0xff]
            const lastLine = await this._writeCmdAndGrabLastLine('PORT',
                (this.activeModeIPv4Address + `,${p1},${p2}`).replaceAll('.', ','))
            if (lastLine[0] === '4' || lastLine[0] === '5') {
                throw new ServerRejectError(`Invalid response received with PORT: ${lastLine}`)
            }
            const result = await callback(dataConnectionPromise)
            await new Promise(resolve => dataServer.close(resolve))
            await new Promise<void>(resolve => dataConnection && dataConnection.end(resolve))
            return result
        }
    }

    public listDir(pathname?: string): Promise<[IListFileInfo[], string] | undefined> {
        return this._executeWithDataConnection(async (connPromise) => {
            const lastLine = await this._writeCmdAndGrabLastLine('LIST', encodePathname(pathname))
            if (! lastLine.startsWith('1')) {
                return undefined
            }
            const conn = await connPromise
            conn.setEncoding(this._encoding) // LIST: text response in data stream
            const lineStream = conn.pipe(split2(/\n|\r\n?/))


            const controlResponseEndMark = this._getResponse()

            const lines = await new Promise<string[]>(resolve => {
                const buf: string[] = []
                lineStream.on('data', x => buf.push(x))
                lineStream.on('end', () => resolve(buf))
            })
            await controlResponseEndMark
            return lines && lines.length ? tryParse(lines) : [[], 'MS-DOS']
        })
    }

    public get(pathname: string): Promise<boolean> {
        const fileStream = createWriteStream('./' + path.basename(pathname))
        return this._executeWithDataConnection(async (connPromise) => {
            let lastLine: string | undefined = await this._writeCmdAndGrabLastLine('RETR', encodePathname(pathname))
            if (! lastLine?.startsWith('1')) {
                fileStream.close()
                return false
            }
            const controlResponseEndMark = this._getResponse()
            const conn = await connPromise
            await new Promise(resolve => fileStream.on('close', resolve))
            lastLine = (await controlResponseEndMark).at(-1)
            return lastLine?.startsWith('2') || false;
        }, (conn) => {
            let totalLength = 0
            conn.pipe(fileStream)
            conn.on('data', buf => this.emitter.emit('progress', totalLength += buf.length))
        })
    }

    public async put(pathname: string): Promise<boolean> {
        try {
            const statInfo = await stat(pathname) // a local pathname, absolute or relative
            if (!statInfo.isFile()) return false
        } catch (e) {
            return false
        }
        return this._executeWithDataConnection(async (connPromise) => {
            let conn: Socket | undefined = undefined
            try {
                let lastLine: string | undefined = await this._writeCmdAndGrabLastLine('STOR', encodePathname(pathname))
                if (!lastLine.startsWith('1')) {
                    return false
                }
                conn = await connPromise
                const fileStream = createReadStream(pathname)
                conn.on('drain', () => this.emitter.emit('progress', fileStream.bytesRead))
                fileStream.on('open', () => fileStream.pipe(conn))
                fileStream.on('close', () => conn && conn.end())
                lastLine = (await this._getResponse()).at(-1)
                return lastLine?.startsWith('2') || false
            } catch (e) {
                console.error(e)
                return false
            }
        })
    }
}