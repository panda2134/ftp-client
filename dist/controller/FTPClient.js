"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FTPClient = exports.InvalidStateError = exports.ServerRejectError = void 0;
const net_1 = require("net");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const split2_1 = __importDefault(require("split2"));
const FTPResponseTransformer_1 = __importDefault(require("./FTPResponseTransformer"));
const ListCmdParser_1 = __importDefault(require("./ListCmdParser"));
const path = __importStar(require("path"));
const assert_1 = require("assert");
const events_1 = require("events");
const Enum_1 = require("./Enum");
function encodePathname(dirname) {
    return dirname ? dirname.replace('\n', '\0') : undefined;
}
class ServerRejectError extends Error {
}
exports.ServerRejectError = ServerRejectError;
class InvalidStateError extends Error {
}
exports.InvalidStateError = InvalidStateError;
class FTPClient {
    constructor(preferredDataConnectionMode = Enum_1.DataConnectionMode.PassiveConnection) {
        this.preferredDataConnectionMode = preferredDataConnectionMode;
        this._state = Enum_1.ClientState.Disconnected;
        this._controlConnection = new net_1.Socket();
        this._encoding = 'ascii';
        this.emitter = new events_1.EventEmitter();
        this._controlConnection.setDefaultEncoding(this._encoding); // encoding for write()
        this._responseStream = this._controlConnection
            .pipe((0, split2_1.default)(/\n|\r\n?/))
            .pipe(new FTPResponseTransformer_1.default())
            .resume();
        this._controlConnection.on('connection', () => { this._state = Enum_1.ClientState.AwaitServerHello; });
        this._controlConnection.on('close', () => { this._state = Enum_1.ClientState.Disconnected; });
    }
    getCurrentState() {
        return this._state;
    }
    setDataConnectionMode(newMode) {
        return this.preferredDataConnectionMode = newMode;
    }
    connect(host, port = 21) {
        return new Promise((resolve, reject) => {
            const serverHelloCallback = (lines) => {
                if (lines.at(-1)?.startsWith('220 ')) {
                    this._state = Enum_1.ClientState.Connected;
                    this._controlConnection.setDefaultEncoding(this._encoding);
                    resolve();
                }
                else {
                    this._state = Enum_1.ClientState.Disconnected;
                    this._controlConnection.end();
                    reject();
                }
            };
            this._responseStream.once('data', serverHelloCallback);
            this._controlConnection.once('error', reject);
            this._controlConnection.connect(port, host);
        });
    }
    _writeCmd(verb, arg) {
        if (this._state !== Enum_1.ClientState.Connected)
            throw new InvalidStateError('Client not connected');
        const controlResponse = this._getResponse();
        this.emitter.emit('request', verb, arg);
        this.emitter.emit('log', verb, arg);
        if (arg != null) {
            this._controlConnection.write(verb + ' ' + arg + '\r\n');
        }
        else {
            this._controlConnection.write(verb + '\r\n');
        }
        return controlResponse;
    }
    _getResponse() {
        return new Promise((resolve, reject) => {
            this._responseStream.once('data', (x) => {
                this.emitter.emit('response', x);
                this.emitter.emit('log', x);
                x.length && !x.at(-1).match(/^[45]\d\d /) ? resolve(x) : reject(x);
            });
        });
    }
    async _writeCmdAndGrabLastLine(verb, arg) {
        const lines = await this._writeCmd(verb, arg);
        if (lines.length === 0) {
            throw new ServerRejectError('Empty response received');
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return lines.at(-1);
    }
    async login(user = 'anonymous', pass) {
        if (user === 'anonymous') {
            pass = 'anonymous@example.com';
        }
        if (pass == null) {
            throw new Error('Password is undefined');
        }
        await this._writeCmdAndGrabLastLine('USER', user);
        const passResponse = await this._writeCmdAndGrabLastLine('PASS', pass);
        if (!passResponse.startsWith('2')) { // handle ACCT, etc
            throw new ServerRejectError(`Login failed with given password: ${passResponse}`);
        }
        const feat = await this.getFeatures(); // TODO: FIXME!!!
        if (feat && feat.indexOf('UTF8') !== -1) {
            this._encoding = 'utf8';
        }
        this._controlConnection.setDefaultEncoding(this._encoding);
    }
    async quit() {
        await this._writeCmd('QUIT');
    }
    async mkdir(dirname) {
        await this._writeCmd('MKD', encodePathname(dirname));
    }
    async chdir(dirname) {
        await this._writeCmd('CWD', encodePathname(dirname));
    }
    async rmdir(dirname) {
        await this._writeCmd('RMD', encodePathname(dirname));
    }
    async deleteFile(dirname) {
        await this._writeCmd('DELE', encodePathname(dirname));
    }
    async renameFile(prevName, newName) {
        const [prevEncoded, newEncoded] = [prevName, newName].map(encodePathname);
        const lastLineRenameFrom = await this._writeCmdAndGrabLastLine('RNFR', prevEncoded);
        if (!lastLineRenameFrom.startsWith('3')) {
            throw new ServerRejectError('3xx expected in RNFR');
        }
        const lastLineRenameTo = await this._writeCmdAndGrabLastLine('RNTO', newEncoded);
        if (!lastLineRenameTo.startsWith('2')) {
            throw new ServerRejectError('2xx expected in RNTO');
        }
    }
    async pwd() {
        const lastLine = await this._writeCmdAndGrabLastLine('PWD');
        if (!lastLine.startsWith('2')) {
            throw new ServerRejectError('2xx expected in PWD');
        }
        const extractPwdRegExp = /^2\d\d "(.*(?:"".*)*)(?:"$|"[^"])/;
        const matchResult = lastLine.match(extractPwdRegExp);
        if (!matchResult) {
            throw new ServerRejectError('Malformed response in PWD');
        }
        const pathThatNeedsProcessing = matchResult[1];
        return pathThatNeedsProcessing.replace('""', '"')
            .replace('\0', '\n');
    }
    async getSystemInfo() {
        const lastLine = await this._writeCmdAndGrabLastLine('SYST');
        if (!lastLine.startsWith('2')) {
            throw new ServerRejectError('2xx expected in SYST');
        }
        return lastLine.substr(4);
    }
    async getFeatures() {
        const lines = await this._writeCmd('FEAT');
        if (lines.length === 0) {
            throw new ServerRejectError('Empty response in FEAT');
        }
        const lastLine = lines.at(-1);
        if (!lastLine || lastLine.match(/^[45]/)) {
            return null;
        }
        return lines.slice(1, -1).map(x => x.trim());
    }
    async _executeWithDataConnection(callback, connInit) {
        const dataServer = new net_1.Server();
        if (this.preferredDataConnectionMode === Enum_1.DataConnectionMode.PassiveConnection || !this.activeModeIPv4Address) {
            const dataConnection = new net_1.Socket();
            const lastLine = await this._writeCmdAndGrabLastLine('PASV');
            const passiveResponseMatchRegExp = /^2\d\d [^\d]*(\d{1,3}),(\d{1,3}),(\d{1,3}),(\d{1,3}),(\d{1,3}),(\d{1,3})[^\d]*$/;
            const res = lastLine.match(passiveResponseMatchRegExp);
            if (!res || res.length !== 7) {
                throw new ServerRejectError(`Invalid response received with PASV: ${lastLine}`);
            }
            const ipAddr = res.slice(1, 5).join('.');
            const port = (parseInt(res[5]) << 8) | parseInt(res[6]);
            if (connInit)
                connInit(dataConnection);
            await new Promise((resolve) => dataConnection.connect(port, ipAddr, resolve));
            const result = await callback(Promise.resolve(dataConnection));
            await new Promise((resolve) => dataConnection.end(resolve));
            return result;
        }
        else {
            let dataConnection = undefined;
            (0, assert_1.equal)(this.preferredDataConnectionMode, Enum_1.DataConnectionMode.PortConnection);
            const dataConnectionPromise = new Promise(resolve => dataServer.on('connection', x => {
                if (connInit)
                    connInit(x);
                dataConnection = x;
                resolve(x);
            }));
            await new Promise(resolve => dataServer.listen(0, '0.0.0.0', resolve));
            const addr = dataServer.address();
            const [p1, p2] = [(addr.port >> 8) & 0xff, addr.port & 0xff];
            const lastLine = await this._writeCmdAndGrabLastLine('PORT', (this.activeModeIPv4Address + `,${p1},${p2}`).replaceAll('.', ','));
            if (lastLine[0] === '4' || lastLine[0] === '5') {
                throw new ServerRejectError(`Invalid response received with PORT: ${lastLine}`);
            }
            const result = await callback(dataConnectionPromise);
            await new Promise(resolve => dataServer.close(resolve));
            await new Promise(resolve => dataConnection && dataConnection.end(resolve));
            return result;
        }
    }
    listDir(pathname) {
        return this._executeWithDataConnection(async (connPromise) => {
            const lastLine = await this._writeCmdAndGrabLastLine('LIST', encodePathname(pathname));
            if (!lastLine.startsWith('1')) {
                return undefined;
            }
            const conn = await connPromise;
            conn.setEncoding(this._encoding); // LIST: text response in data stream
            const lineStream = conn.pipe((0, split2_1.default)(/\n|\r\n?/));
            const controlResponseEndMark = this._getResponse();
            const lines = await new Promise(resolve => {
                const buf = [];
                lineStream.on('data', x => buf.push(x));
                lineStream.on('end', () => resolve(buf));
            });
            await controlResponseEndMark;
            return lines && lines.length ? (0, ListCmdParser_1.default)(lines) : [[], 'MS-DOS'];
        });
    }
    async get(pathname) {
        const fileStream = (0, fs_1.createWriteStream)('./' + path.basename(pathname));
        await this._executeWithDataConnection(async (connPromise) => {
            let lastLine = await this._writeCmdAndGrabLastLine('RETR', encodePathname(pathname));
            if (!lastLine?.startsWith('1')) {
                fileStream.close();
                throw new ServerRejectError(`RETR rejected with: ${lastLine}`);
            }
            const controlResponseEndMark = this._getResponse();
            await connPromise;
            await new Promise(resolve => fileStream.on('close', resolve));
            lastLine = (await controlResponseEndMark).at(-1);
            if (!lastLine?.startsWith('2')) {
                throw new ServerRejectError(`RETR rejected (after download) with: ${lastLine}`);
            }
        }, (conn) => {
            let totalLength = 0;
            conn.pipe(fileStream);
            conn.on('data', buf => this.emitter.emit('progress', totalLength += buf.length));
        });
    }
    async put(pathname) {
        try {
            const statInfo = await (0, promises_1.stat)(pathname); // a local pathname, absolute or relative
            if (!statInfo.isFile()) {
                throw new Error('not a file');
            }
        }
        catch (e) {
            throw new Error('stat() failed');
        }
        await this._executeWithDataConnection(async (connPromise) => {
            let conn = undefined;
            try {
                let lastLine = await this._writeCmdAndGrabLastLine('STOR', encodePathname(pathname));
                if (!lastLine.startsWith('1')) {
                    // noinspection ExceptionCaughtLocallyJS
                    throw new ServerRejectError(`STOR rejected with: "${lastLine}"`);
                }
                conn = await connPromise;
                const fileStream = (0, fs_1.createReadStream)(pathname);
                conn.on('drain', () => this.emitter.emit('progress', fileStream.bytesRead));
                fileStream.on('open', () => fileStream.pipe(conn));
                fileStream.on('close', () => conn && conn.end());
                lastLine = (await this._getResponse()).at(-1);
                return lastLine?.startsWith('2') || false;
            }
            catch (e) {
                console.error(e);
                throw e;
            }
        });
    }
}
exports.FTPClient = FTPClient;
//# sourceMappingURL=FTPClient.js.map