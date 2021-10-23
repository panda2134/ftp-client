import { FTPClient } from './FTPClient'

async function main() {
    const c = new FTPClient()
    await c.connect('166.111.82.13')
    await c.login('ssast2021', '%SSAST!Fall42')
    console.log(await c.listDir())
    await c.put('./NetBSD-9.0-amd64.iso') // NetBSD-9.0-amd64.iso
    await c.get('./1.iso')
    console.log('put!')
    await c.quit()
}
main()