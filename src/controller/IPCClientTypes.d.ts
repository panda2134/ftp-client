import {IListFileInfo} from "./ListCmdParser"
import {ClientState, DataConnectionMode} from "./Enum";

interface GlobalEvents {
    onRequest (fn: (verb: string, arg?: string) => void): void
    onResponse (fn: (resp: string[]) => void): void
    onLog (fn: (...args: any[]) => void): void
    onProgress (fn: (num: number) => void): void
}

declare global {
    interface Window {
        $invoke(channel: 'local.setPreferredMode', newMode: DataConnectionMode): Promise<void>

        $invoke(channel: 'local.rmdir', dir: string): Promise<void>
        $invoke(channel: 'local.rm', path: string): Promise<void>
        $invoke(channel: 'local.mv', pathOld: string, pathNew: string): Promise<void>

        $invoke(channel: 'local.getLocalDir'): Promise<string>

        $invoke(channel: 'local.changeLocalDir', dir: string): Promise<void>

        $invoke(channel: 'local.listLocalDir'): Promise<IListFileInfo[]>

        $invoke(channel: 'client.getCurrentState'): Promise<ClientState>

        $invoke(channel: 'client.connect', host: string, port?: number): Promise<void>

        $invoke(channel: 'client.login', user?: string, pass?: string): Promise<void>

        $invoke(channel: 'client.pwd'): Promise<string>

        $invoke(channel: 'client.getSystemInfo'): Promise<string>

        $invoke(channel: 'client.getFeatures'): Promise<string[] | null>

        $invoke(channel: 'client.quit'): Promise<void>

        $invoke(channel: 'client.get', path: string): Promise<void>

        $invoke(channel: 'client.put', path: string): Promise<void>

        $invoke(channel: 'client.mkdir', path: string): Promise<void>

        $invoke(channel: 'client.rmdir', path: string): Promise<void>

        $invoke(channel: 'client.chdir', path: string): Promise<void>

        $invoke(channel: 'client.deleteFile', path: string): Promise<void>

        $invoke(channel: 'client.listDir', path?: string): Promise<[IListFileInfo[], string] | undefined>

        $invoke(channel: 'client.renameFile', prevName: string, newName: string): Promise<void>

        $events: GlobalEvents
    }
}