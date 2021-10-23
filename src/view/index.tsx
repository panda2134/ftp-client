import ReactDOM from 'react-dom'
import * as React from 'react'
import '@fontsource/roboto/index.css'
import App from "./App"
import {Fragment} from "react";
import {CssBaseline} from "@mui/material";
import {SnackbarProvider} from "notistack";

const element = (<Fragment> <CssBaseline/>
    <SnackbarProvider maxSnack={5}>
        <App/>
    </SnackbarProvider> </Fragment>)

ReactDOM.render(element, document.querySelector('#app'))