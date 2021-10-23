import * as React from 'react'
import {
    AppBar,
    Box, Button,
    Container,
    IconButton, InputAdornment, InputBase,
    LinearProgress, styled, TextField,
    Toolbar,
    Typography
} from '@mui/material'
import { Computer, Lock, Menu, PeopleAlt } from '@mui/icons-material'
import {alpha} from "@material-ui/core"

export interface ConnectArgs {
    serverAddr: string
    username: string;
    password?: string;
}

const AppBarInputWrapper = styled('div')(({theme})=>({
    position: 'relative',
    borderRadius: theme.shape.borderRadius,
    backgroundColor: alpha(theme.palette.common.white, 0.15),
    '&:hover': {
        backgroundColor: alpha(theme.palette.common.white, 0.25),
    },
    marginLeft: theme.spacing(1),
    marginRight: theme.spacing(1),
    width: 'auto',
}))

const InputIconWrapper = styled('div')(({theme}) => ({
    padding: theme.spacing(0, 2),
    height: '100%',
    position: 'absolute',
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
}))

const StyledInputBase = styled(InputBase)(({ theme }) => ({
    color: 'inherit',
    '& .MuiInputBase-input': {
        padding: theme.spacing(1, 1, 1, 0),
        // vertical padding + font size from searchIcon
        paddingLeft: `calc(1em + ${theme.spacing(4)})`,
        width: '20ch',
    },
}))

export default function TopBar(props: { connectCallback: (arg: ConnectArgs) => void, drawerCallback: () => void }) {
    const [serverAddr, setServerAddr] = React.useState('')
    const [username, setUsername] = React.useState('anonymous')
    const [password, setPassword] = React.useState('anonymous@example.invalid')

    React.useEffect(() => {
        if (username === 'anonymous') setPassword('anonymous@example.invalid')
    }, [username])

    return (<AppBar position={"static"}>
        <Toolbar>
            <IconButton edge={"start"} color={"inherit"} aria-label={"menu"} onClick={() => { props.drawerCallback() }}>
                <Menu/>
            </IconButton>
            <Typography variant="h6" color="inherit" component="div" sx={{ flexGrow: 1 }}>
                FTP Client
            </Typography>
            <Box display={"flex"} alignItems={"center"} justifyContent={"space-between"}>
                <AppBarInputWrapper>
                    <InputIconWrapper>
                        <Computer />
                    </InputIconWrapper>
                    <StyledInputBase
                        placeholder={"Server"}
                        value={serverAddr}
                        required
                        onChange={(evt) => setServerAddr(evt.target.value)}
                    />
                </AppBarInputWrapper>
                <AppBarInputWrapper>
                    <InputIconWrapper>
                        <PeopleAlt />
                    </InputIconWrapper>
                    <StyledInputBase
                        placeholder={"Username"}
                        value={username}
                        required
                        onChange={(evt) => setUsername(evt.target.value)}
                    />
                </AppBarInputWrapper>
                <AppBarInputWrapper>
                    <InputIconWrapper>
                        <Lock />
                    </InputIconWrapper>
                    <StyledInputBase
                        placeholder={"Password"}
                        type={"password"}
                        value={password}
                        onChange={(evt) => setPassword(evt.target.value)}
                        disabled={username === 'anonymous'}
                    />
                </AppBarInputWrapper>
                <Button color={"inherit"} type="submit" onClick={() => {
                    props.connectCallback && props.connectCallback({
                        serverAddr, username, password
                    })
                }}>Connect</Button>
            </Box>
        </Toolbar>
    </AppBar>)
}