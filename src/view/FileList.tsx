import * as React from 'react'
import {useEffect, useLayoutEffect, useState} from 'react'
import {useDebounce} from '@react-hook/debounce'
import {
    Box,
    Breadcrumbs,
    Card,
    CardContent,
    CardHeader,
    Checkbox, Dialog, DialogTitle,
    Divider,
    LinearProgress,
    Link,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography
} from "@mui/material"
import {
    ArrowUpward,
    Cloud,
    DeleteForever,
    DriveFileRenameOutline,
    Folder,
    InsertDriveFile,
    NavigateNext,
    Storage
} from "@mui/icons-material"
import {IListFileInfo} from "../controller/ListCmdParser"
import prettyBytes from "pretty-bytes"
import {useSnackbar} from "notistack"

interface FileListProps {
    type?: 'local' | 'remote';
    connected?: boolean;
    sx?: any;
    updateSelected?: (xs: IListFileInfoEx[]) => void
}

export interface IListFileInfoEx extends IListFileInfo {
    selected?: boolean
}

const FileList: React.FunctionComponent<FileListProps> = (props) => {
    const [rmDialogOpen, setRmDialogOpen] = useState<boolean>()
    const [mvDialogOpen, setMvDialogOpen] = useState<boolean>()
    const [anchorPos, setAnchorPos] = useState<null | [number, number]>(null)
    const [dir, setDir] = useState<string | undefined>()
    const [list, setList] = useState<readonly IListFileInfoEx[]>()
    const [loading, setLoading] = useDebounce<boolean>(true)
    const {enqueueSnackbar} = useSnackbar()

    const updateList = () => {
        const listFolder = async () => {
            if (props.type === 'local') {
                return window.$invoke('local.listLocalDir')
            } else {
                return (await window.$invoke('client.listDir'))[0]
            }
        }
        if (props.connected) {
            setLoading(true)
            listFolder()
                .then(x => x.sort((a, b) => (a.type === 'directory' ? 0 : 1) - (b.type === 'directory' ? 0 : 1)))
                .then(x => setList(x))
                .catch((x) => {
                    enqueueSnackbar(`Failed to list folder: ${x}`, {variant: 'error'})
                })
        } else {
            setList([])
        }
    }
    useLayoutEffect(() => {
        props.updateSelected(list ? list.filter(x => x.selected) : [])
    }, [list])
    const updateCwd = async () => {
        const getCurrentFolder = () => {
            return props.type === 'local' ?
                window.$invoke('local.getLocalDir')
                : window.$invoke('client.pwd')
        }
        if (props.connected) {
            await getCurrentFolder().then(x => setDir(x))
            updateList()
            setLoading(false)
        } else {
            setDir(undefined)
            setLoading(false)
            return Promise.resolve()
        }
    }
    const tryChdir = async (x: string) => {
        if (props.type === 'remote' && loading) {
            return
        }
        setLoading(true)
        try {
            if (props.type === 'local') {
                await window.$invoke('local.changeLocalDir', x)
            } else {
                await window.$invoke('client.chdir', x)
            }
            await updateCwd()
        } catch (e) {
            enqueueSnackbar(`Failed to change directory to ${x}`, {variant: 'error'})
            setLoading(false)
        }
    }
    const tryRemove = async () => {
        if (!list) return

        for (const file of list) {
            if (! file.selected) continue

            try {
                if (props.type === 'local') {
                    if (file.type === 'directory') await window.$invoke('local.rmdir', file.filename)
                    else await window.$invoke('local.rm', file.filename)
                } else {
                    if (!props.connected) return
                    if (file.type === 'directory') await window.$invoke('client.rmdir', file.filename)
                    else await window.$invoke('client.deleteFile', file.filename)
                }
                await updateCwd()
            } catch (e) {
                enqueueSnackbar(`Cannot remove "${file?.filename}": ${e}`,
                    {variant: 'error'})
            }
        }
    }
    const tryRename = async (newName: string) => {
        if (!list) return

        for (const file of list) {
            if (!file.selected) continue
            try {
                if (props.type === 'local') {
                    await window.$invoke('local.mv', file.filename, newName)
                } else {
                    await window.$invoke('client.renameFile', file.filename, newName)
                }
                await updateCwd()
            } catch (e) {
                enqueueSnackbar(`Cannot rename "${file?.filename}" to "${newName}": ${e}`,
                    {variant: 'error'})
            }
        }
    }
    useEffect(() => {
        updateCwd()
    }, [props.connected, props.type])

    const header = <CardHeader avatar={props.type === 'local' ? <Storage/> : <Cloud/>}
                               title={props.type === 'local' ? 'Local' : 'Remote'}
    />

    let content: JSX.Element
    if (!props.connected) {
        content = (<CardContent>
            <Box display={"flex"} alignItems={"center"} justifyContent={"center"}>
                <Typography variant={"h4"} color={"text.info"}>Not Connected</Typography>
            </Box>
        </CardContent>)
    } else {
        let fileListContents: JSX.Element[]
        if (loading) {
            fileListContents = [<TableRow key={0}>
                <TableCell colSpan={5}><LinearProgress sx={{width: '100%'}}/></TableCell>
            </TableRow>]
        } else {
            fileListContents = [(<TableRow key={"cdUp"} onClick={tryChdir.bind(null, '..')} sx={{cursor: 'pointer'}}>
                <TableCell sx={{px: '13px', py: '10px'}}>
                    <ArrowUpward/>
                </TableCell>
                <TableCell>Parent folder</TableCell>
                <TableCell align={"right"}/>
                <TableCell align={"right"}/>
                <TableCell align={"right"}/>
            </TableRow>)]
            if (list) {
                fileListContents.push(...(list.map((file, index) => (
                    <TableRow key={file.filename} onContextMenu={(evt) => {
                        evt.preventDefault()
                        if (anchorPos === null) {
                            setAnchorPos([evt.clientX, evt.clientY])
                        } else {
                            setAnchorPos(null)
                        }
                    }}>
                        <TableCell padding={"checkbox"}>
                            <Checkbox color={"primary"}
                                      checked={file.selected ?? false}
                                      onChange={(evt) => {
                                          const newList = Array.from(list)
                                          newList[index].selected = evt.target.checked
                                          setList(newList)
                                      }}
                            />
                        </TableCell>
                        <TableCell component={"th"} scope={"row"}
                                   onClick={file.type === 'directory' ?
                                       tryChdir.bind(null, './' + file.filename)
                                       : undefined}
                                   sx={{cursor: file.type === 'directory' ? 'pointer' : 'initial'}}
                        >
                            <Box display={"flex"} alignItems={"center"}>
                                {file.type === 'directory' ?
                                    <Folder color="secondary" fontSize="small" sx={{mr: 1}}/>
                                    : <InsertDriveFile fontSize="small" sx={{mr: 1}}/>}
                                {file.filename}
                            </Box>
                        </TableCell>
                        <TableCell align={"right"}>{file.permission}</TableCell>
                        <TableCell align={"right"}>{file.size && prettyBytes(file.size)}</TableCell>
                        <TableCell align={"right"}>
                            {file.lastModified && file.lastModified.toLocaleString('en-US')}
                        </TableCell>
                    </TableRow>))))
            }
        }
        content = (<CardContent sx={{display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden'}}>
            <Breadcrumbs
                separator={<NavigateNext fontSize={"small"}/>}
                aria-label={"breadcrumb"}
                sx={{my: 1}}
            >
                {(() => {
                    if (!dir) return;
                    const res = dir.split('/');
                    res[0] = '/'
                    if (!res[1].length) res.pop()
                    return res.map((part, index) =>
                        <Link
                            key={part}
                            color={index === res.length - 1 ? 'text.primary' : 'inherit'}
                            onClick={tryChdir.bind(null, res.slice(0, index + 1).join('/'))}
                            sx={{cursor: 'pointer'}}
                        >
                            {part}
                        </Link>)
                })()}
            </Breadcrumbs>
            <TableContainer sx={{flexGrow: 1}} component={Paper}>
                <Table stickyHeader={true}>
                    <TableHead>
                        <TableRow>
                            <TableCell padding={"checkbox"}>
                                <Checkbox
                                    disabled={loading}
                                    color={"primary"}
                                    checked={list ? (list.reduce((cnt, cur) => cnt + (cur.selected ? 1 : 0), 0) === list.length) : false}
                                    onChange={(evt) => {
                                        const newList = Array.from(list)
                                        for (const x of newList) {
                                            x.selected = evt.target.checked
                                        }
                                        setList(newList)
                                    }}
                                />
                            </TableCell>
                            <TableCell>Filename</TableCell>
                            <TableCell align={"right"}>Permission</TableCell>
                            <TableCell align={"right"}>Size</TableCell>
                            <TableCell align={"right"}>Last Modified</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody sx={{width: '100%'}}>
                        {...fileListContents}
                    </TableBody>
                </Table>
            </TableContainer>
            <Menu anchorReference={"anchorPosition"}
                  anchorPosition={anchorPos ? { left: anchorPos[0], top: anchorPos[1] } : undefined}
                  open={Boolean(anchorPos?.length)}
                  onClose={() => {
                      setAnchorPos(null)
                  }}
            >
                <MenuItem>
                    <ListItemIcon><DeleteForever fontSize={"small"}/></ListItemIcon>
                    <ListItemText>Delete</ListItemText>
                </MenuItem>
                <MenuItem>
                    <ListItemIcon><DriveFileRenameOutline fontSize={"small"}/></ListItemIcon>
                    <ListItemText>Rename...</ListItemText>
                </MenuItem>
            </Menu>
            <Dialog open={rmDialogOpen} onClose={() => { setRmDialogOpen(false) }}>
                <DialogTitle>{"Remove the selected files?"}</DialogTitle>
            </Dialog>
            <Dialog open={mvDialogOpen} onClose={() => { setMvDialogOpen(false) }}>

            </Dialog>
        </CardContent>)
    }

    return (
        <Card elevation={1} sx={Object.assign({
            display: 'flex', flexDirection: 'column'
        }, props.sx)}>
            {header}
            <Divider/>
            {content}
        </Card>
    )
}

FileList.defaultProps = {
    connected: true,
    type: 'local',
    updateSelected: () => void (0)
}

export default FileList