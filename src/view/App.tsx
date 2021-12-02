import * as React from 'react'
import {useEffect, useRef, useState} from 'react'
import {
    AppBar,
    Autocomplete, Backdrop,
    Box,
    Button,
    Container,
    Drawer,
    FormControlLabel,
    FormGroup,
    LinearProgress,
    Stack,
    Switch,
    TextField,
    Toolbar,
    Typography
} from '@mui/material'
import FileList, {IListFileInfoEx} from './FileList'
import {DataConnectionMode} from "../controller/Enum"
import TopBar, {ConnectArgs} from './TopBar'
import {XTerm} from "xterm-for-react"
import {useSnackbar} from 'notistack'
import {IPv4Addr} from "../controller/IPv4Addr";
import {CircularProgress} from "@material-ui/core";

export default function App(): JSX.Element {
    const [connected, setConnected] = useState<boolean>(false)
    const [preferPort, setPreferPort] = useState<boolean>(false)
    const [ipv4AddrList, setIPv4AddrList] = useState<IPv4Addr[]>([])
    const [addrDropdownOpen, setAddrDropdownOpen] = useState<boolean>(true)
    const [addrLoading, setAddrLoading] = useState<boolean>(false)
    const [localListKey, setLocalListKey] = useState<number>(0)
    const [remoteListKey, setRemoteListKey] = useState<number>(1)
    const [drawerOpen, setDrawerOpen] = useState<boolean>(false)
    const [localList, setLocalList] = useState<readonly IListFileInfoEx[]>()
    const [remoteList, setRemoteList] = useState<readonly IListFileInfoEx[]>()
    const [dataState, setDataState] = useState<'idle' | 'upload' | 'download'>('idle')
    const [currentFile, setCurrentFile] = useState<IListFileInfoEx>(null)
    const [currentProgress, setCurrentProgress] = useState<number>(0)
    const { enqueueSnackbar } = useSnackbar()
    const xtermRef = useRef<XTerm>(null)

    const handleUpload = async () => {
        if (dataState !== 'idle') return
        setDataState('upload')
        if (localList.reduce((s, x) => s || x.type === 'directory' , false)){
            enqueueSnackbar('Some selected objects are folders. Uploading folders is currently unsupported.')
        }
        let ok = true
        for (const item of localList) {
            if (item.type === 'directory') continue
            setCurrentFile(item)
            try {
                await window.$invoke('client.put', item.filename)
            } catch (e) {
                ok = false
                enqueueSnackbar(`Failed to upload ${item.filename}: ${e}`, { variant: 'error' })
            }
        }
        setDataState('idle')
        setCurrentProgress(0)
        setLocalListKey(Math.random())
        setRemoteListKey(Math.random())
        if (ok) {
            enqueueSnackbar("Upload complete", {variant: 'success'})
        } else {
            enqueueSnackbar("Some uploads failed", { variant: "warning" })
        }
    }
    const handleDownload = async () => {
        if (dataState !== 'idle') return
        setDataState('download')
        if (remoteList.reduce((s, x) => s || x.type === 'directory' , false)){
            enqueueSnackbar('Some selected objects are folders. Downloading folders is currently unsupported.')
        }
        let ok = true
        for (const item of remoteList) {
            if (item.type === 'directory') continue
            setCurrentFile(item)
            try {
                await window.$invoke('client.get', item.filename)
            } catch (e) {
                ok = false
                enqueueSnackbar(`Failed to download ${item.filename}: ${e}`, { variant: 'error' })
            }
        }
        setDataState('idle')
        setCurrentProgress(0)
        setLocalListKey(Math.random())
        setRemoteListKey(Math.random())
        if (ok) {
            enqueueSnackbar("Download complete", {variant: 'success'})
        } else {
            enqueueSnackbar("Some downloads failed", { variant: "warning" })
        }
    }

    useEffect(() => {
        window.$events.onProgress((num) => {
            setCurrentProgress(num)
        })
    }, [])
    useEffect(() => {
        window.$events.onRequest((verb, arg) => {
            if (arg != null) {
                xtermRef.current.terminal.writeln(`> ${verb} ${arg}`)
            } else {
                xtermRef.current.terminal.writeln(`> ${verb}`)
            }
        })
        window.$events.onResponse((resp) => {
            for (const line of resp) {
                if (line) {
                    const color = (line[0] == '4' || line[0] == '5') ? 31 : 32
                    xtermRef.current.terminal.writeln(`\x1b[1;${color}m` + line + "\x1b[0m")
                }
            }
        })
        window.$events.onDisconnect(() => {
            setConnected(false)
        })
        window.$invoke('local.getPreferredMode')
            .then(mode => {
                setPreferPort(mode === DataConnectionMode.PortConnection)
            })
    }, [])
    useEffect(() => {
        if (preferPort) {
            setAddrLoading(true)
            window.$invoke('local.getLocalIPv4Address')
                .then(async (xs) => {
                    await window.$invoke('local.setPreferredMode', DataConnectionMode.PortConnection)
                    await window.$invoke('local.setPortAddr', xs[0].addr)
                    return setIPv4AddrList(xs)
                })
                .then(() => setAddrLoading(false))
        }
    }, [preferPort])

    const tryLogin = async (args: ConnectArgs) => {
        xtermRef.current.terminal.clear()
        const [host, portStr] = args.serverAddr.split(':')
        const port = Number.isInteger(parseInt(portStr)) ? parseInt(portStr) : undefined
        try {
            await window.$invoke('client.connect', host, port)
            await window.$invoke('client.login', args.username, args.password)
            if (!connected) { // ONLY update FileList once, or RACE CONDITION! F**K! I spent over 5 hours on this!!!
                setConnected(true)
            } else {
                setRemoteListKey(Math.random())
            }
        } catch (e) {
            const error = `Connection to ${host}:${port ?? 21} failed: ${e}`
            console.error(error)
            enqueueSnackbar(error, { variant: 'error' })
        }
    }

    return (
        <Container maxWidth={false} disableGutters={true}>
            <Box height={"100vh"} display={"flex"} flexDirection={"column"}>
                <TopBar connectCallback={tryLogin} drawerCallback={() => {setDrawerOpen(true)}}/>
                <Box flexShrink={1} flexGrow={1} overflow={"hidden"}
                     display={"flex"} flexDirection={"row"} justifyContent={"center"} alignItems={"center"}
                     sx={{ px: 2, py: 2 }}>
                    <FileList key={localListKey} connected={true} type={'local'} sx={{
                        flexGrow: '1', width: '40vw', height: '100%', mx: 1
                    }}
                              updateSelected={setLocalList}
                    />
                    <Box display={"flex"}
                         flexDirection={"column"}
                         justifyContent={"center"}
                         alignItems={"center"}>
                        <Button variant={"outlined"}
                                sx={{my: 1}}
                                disabled={!connected || dataState !== 'idle'}
                                onClick={() => {
                                    handleUpload()
                                }}
                        >≫</Button>
                        <Button variant={"outlined"}
                                sx={{my: 1}}
                                disabled={!connected || dataState !== 'idle'}
                                onClick={() => {
                                    handleDownload()
                                }}
                        >≪</Button>
                    </Box>
                    <FileList key={remoteListKey} connected={connected} type={'remote'}  sx={{
                        flexGrow: '1', width: '40vw', height: '100%', mx: 1
                    }}
                              updateSelected={setRemoteList}
                    />
                </Box>
                <AppBar position={"static"}>
                    <Toolbar variant={"dense"}>
                        <Box justifyContent={"space-between"}
                             alignItems={"center"}
                             display={"flex"}
                             flexDirection={"row"}
                             width={"100%"}>
                            <span>{ dataState==='idle' ? "Idle" :
                                (dataState==='upload' ? `Uploading ${currentFile?.filename}...` : `Downloading ${currentFile?.filename}...`)
                            }</span>
                            {connected && dataState!=='idle' ? <LinearProgress
                                color={"warning"}
                                variant={"determinate"}
                                value={currentProgress / (currentFile?.size ?? 1) * 100}
                                sx={{width: '40%'}}/> : undefined}
                        </Box>
                    </Toolbar>
                </AppBar>
            </Box>
            <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} ModalProps={{keepMounted: true}}>
                <Box mx={2} my={1}>
                    <Typography variant={"h4"} gutterBottom>Settings</Typography>
                    <Typography variant={"h5"} gutterBottom>Connection mode</Typography>
                    <Stack direction={"row"} spacing={1} alignItems={"center"}>
                        <FormGroup>
                            <Typography variant={"caption"}>Settings below take effect at your next connection.</Typography>
                            <FormControlLabel control={<Switch value={preferPort}
                                                               onChange={(evt) => {setPreferPort(evt.target.checked)}}/>}
                                              label={"PORT mode"} />
                            {preferPort ? <Autocomplete renderInput={(params) => (
                                <TextField {...params}
                                           onBlur={(evt) => {
                                               const addr = evt.target.value.split(' ')[0]
                                               if (addr) {
                                                   console.log('setting to', addr)
                                                   window.$invoke('local.setPreferredMode', DataConnectionMode.PortConnection)
                                                   window.$invoke('local.setPortAddr', addr)
                                               }
                                           }}
                                />)}
                                           options={ipv4AddrList}
                                           getOptionLabel={(x: IPv4Addr) => `${x.addr} (${x.iface})`}
                                           loading={addrLoading}
                                           open={addrDropdownOpen}
                                           onOpen={() => {
                                               setAddrDropdownOpen(true)
                                           }}
                                           onClose={() => {
                                               setAddrDropdownOpen(false)
                                           }}
                            /> : undefined}
                        </FormGroup>
                    </Stack>
                    <Typography variant={"h5"} gutterBottom>Debug info</Typography>
                    <XTerm ref={xtermRef} />
                </Box>
            </Drawer>
            <Backdrop open={connected && dataState !== 'idle'}
                      sx={{ zIndex: (theme) => theme.zIndex.appBar - 1 }}
            >
                <CircularProgress color={"secondary"} />
            </Backdrop>
        </Container>)
}