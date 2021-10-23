import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('$invoke',
    (channel: string, ...args: any[]) => {
        return ipcRenderer.invoke(channel, ...args)
    }
)

contextBridge.exposeInMainWorld('$events',{
    onRequest (fn: (verb: string, arg?: string) => void) {
        ipcRenderer.on('request', (evt, verb: string, arg?: string) => fn(verb, arg))
    },
    onResponse (fn: (resp: string[]) => void) {
        ipcRenderer.on('response', (evt, resp: string[]) => fn(resp))
    },
    onLog (fn: (...args: any[]) => void) {
        ipcRenderer.on('log', (evt, ...args: any[]) => {
            console.log('in preload:', evt, args)
            fn(...args)
        })
    },
    onProgress (fn: (num: number) => void) {
        ipcRenderer.on('progress', (evt, num: number) => fn(num))
    }
})

// log to console by default
ipcRenderer.on('log', console.log)