import * as React from 'react'
import {useEffect, useRef, useState} from 'react'
import {
    AppBar, Backdrop,
    Box, Button, CircularProgress,
    Container, Divider, Drawer,
    IconButton, InputAdornment, InputBase,
    LinearProgress, Snackbar, Stack, styled, Switch, TextField,
    Toolbar,
    Typography
} from '@mui/material'
import { Computer, Lock, Menu, PeopleAlt} from '@mui/icons-material'
import FileList, {IListFileInfoEx} from './FileList'
import {ClientState} from "../controller/Enum"
import TopBar, {ConnectArgs} from './TopBar'
import {XTerm} from "xterm-for-react"
import { SnackbarProvider, VariantType, useSnackbar } from 'notistack'
import {green} from "@mui/material/colors";

export default function App(): JSX.Element {
    const [anonymous, setAnonymous] = useState<boolean>(true)
    const [connected, setConnected] = useState<boolean>(false)
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
        if (localList.reduce((s, x) => s || x.type === 'directory' , false)){
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
        window.$events.onLog(console.log)
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
    }, [])

    const tryLogin = async (args: ConnectArgs) => {
        xtermRef.current.terminal.clear()
        const [host, portStr] = args.serverAddr.split(':')
        const port = Number.isInteger(parseInt(portStr)) ? parseInt(portStr) : undefined
        try {
            await window.$invoke('client.connect', host, port)
            await window.$invoke('client.login', args.username, args.password)
            setAnonymous(args.username === 'anonymous')
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
                                disabled={!connected || anonymous || dataState !== 'idle'}
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
                <Box m={1}>
                    <Typography variant={"h4"}>Settings</Typography>
                    <Divider/>
                    <Stack direction={"row"} spacing={1} alignItems={"center"}>
                        <Typography>PASV</Typography>
                        <Switch />
                        <Typography>PORT</Typography>
                    </Stack>
                    <XTerm ref={xtermRef} />
                </Box>
            </Drawer>
        </Container>)
}