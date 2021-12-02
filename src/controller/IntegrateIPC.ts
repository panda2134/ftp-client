import {BrowserWindow, ipcMain} from 'electron'
import {FTPClient} from './FTPClient'
import * as fs from 'fs/promises'
import path from 'canonical-path'
import {IListFileInfo} from "./ListCmdParser"
import {DataConnectionMode} from "./Enum"
import * as os from "os";
import {IPv4Addr} from "./IPv4Addr";

let client: FTPClient | undefined = undefined
let portAddr: string | undefined = undefined
let mode = DataConnectionMode.PassiveConnection
let initialized = false

async function listLocalDir() {
    const ret: IListFileInfo[] = []
    for (const filename of await fs.readdir('.')) {
        const info: IListFileInfo = {
            filename
        }
        const stat = await fs.stat('./' + filename)
        info.size = stat.size
        info.lastModified = stat.mtime
        info.type = stat.isDirectory() ? 'directory' : 'file'
        info.permission = (stat.mode & 0o777).toString(8)
        ret.push(info)
    }
    return ret
}

function getLocalIPv4Address() {
    const iface = os.networkInterfaces()
    const ret: IPv4Addr[] = []
    for (const [k, v] of Object.entries(iface)) {
        for (const addrInfo of v) {
            if (addrInfo.family === 'IPv4' && !addrInfo.internal) {
                ret.push({ iface: k, addr: addrInfo.address })
            }
        }
    }
    return ret
}

export function registerIPC(win: BrowserWindow): void {
    if (initialized) return
    initialized = true

    ipcMain.handle('local.setPreferredMode', (event, newMode: DataConnectionMode) => { mode = newMode })
    ipcMain.handle('local.getPreferredMode', () => mode)
    ipcMain.handle('local.getLocalDir', () => path.normalize(process.cwd()))
    ipcMain.handle('local.changeLocalDir', (event, dir: string) => { process.chdir(dir) })
    ipcMain.handle('local.listLocalDir', () => listLocalDir())
    ipcMain.handle('local.mkdir', (event, x: string) => fs.mkdir(x))
    ipcMain.handle('local.rmdir', (event, dir: string) => fs.rmdir(dir) )
    ipcMain.handle('local.rm', (event, path: string) => fs.unlink(path))
    ipcMain.handle('local.mv', (event, pathOld: string, pathNew: string) => fs.rename(pathOld, pathNew))
    ipcMain.handle('local.getLocalIPv4Address', () => getLocalIPv4Address())
    ipcMain.handle('local.setPortAddr', (event, addr) => { portAddr = addr })

    const DO_NOT_GENERATE_FOR = ['connect', 'constructor']
    for (const keyName of Object.getOwnPropertyNames(FTPClient.prototype)) {
        if (typeof Object(FTPClient.prototype)[keyName] === 'function'
            && DO_NOT_GENERATE_FOR.indexOf(keyName) == -1
            && ! keyName.startsWith('_')) {
            ipcMain.handle(`client.${keyName}`, (event, ...args) => {
                if (client == null) {
                    throw new Error('Calling client methods by IPC, but client is not defined')
                }
                // eslint-disable-next-line
                return (client as any)[keyName].apply(client, args)
            })
        }
    }
    ipcMain.handle('client.connect', async (event, host: string, port?: number) => {
        if (client != null) {
            try {
                await client.quit()
            } catch (e) {
                console.warn(`Error ending the previous connection:${e}`)
            }
        }
        client = new FTPClient(mode)
        if (mode === DataConnectionMode.PortConnection && portAddr) {
            client.activeModeIPv4Address = portAddr
        }
        // Attach events here
        for (const channel of ['request', 'response', 'log', 'disconnect']) {
            client.emitter.on(channel, (...args) => {
                win.webContents.send(channel, ...args)
            })
        }
        const progressListener = (num: number) => {
            setTimeout(() => { client.emitter.once('progress', progressListener) }, 300)
            win.webContents.send('progress', num)
        }
        client.emitter.once('progress', progressListener)
        await client.connect(host, port)
    })
}