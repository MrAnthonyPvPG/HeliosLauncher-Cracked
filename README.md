<p align="center"><img src="./app/assets/images/icon.png" width="150px" height="150px" alt="aventium softworks"></p>

<h1 align="center">ФЛАУНЧЕР</h1>

[<p align="center"><img src="https://img.shields.io/github/actions/workflow/status/Envel-Experimental/HeliosLauncher/build.yml?branch=master&style=for-the-badge" alt="gh actions">](https://github.com/Envel-Experimental/HeliosLauncher/actions) [<img src="https://img.shields.io/github/downloads/Envel-Experimental/HeliosLauncher/total.svg?style=for-the-badge" alt="downloads">](https://github.com/Envel-Experimental/HeliosLauncher/releases) <img src="https://forthebadge.com/images/badges/winter-is-coming.svg"  height="28px" alt="winter-is-coming"></p>

> **Disclaimer:** This software is a custom application manager and launcher designed for educational purposes in programming courses. It does not contain, distribute, or bundle any third-party proprietary assets or data. The software is a tool for managing local development environments. Users are solely responsible for ensuring they have the necessary rights and licenses to any third-party content they access through this tool.
>
> **Отказ от ответственности:** Данное программное обеспечение является специализированным менеджером приложений и лаунчером, разработанным в образовательных целях для курсов программирования. Оно не содержит, не распространяет и не включает в себя сторонние проприетарные активы или данные. Программа является инструментом для управления локальными средами разработки. Пользователи несут единоличную ответственность за наличие необходимых прав и лицензий на любой сторонний контент, доступ к которому осуществляется через данный инструмент.

## Downloads

You can download from [GitHub Releases](https://github.com/Envel-Experimental/HeliosLauncher/releases)

## Console

To open the console, use the following keybind.

```console
ctrl + shift + i
```

Ensure that you have the console tab selected. Do not paste anything into the console unless you are 100% sure of what it will do. Pasting the wrong thing can expose sensitive information.

#### Export Output to a File

If you want to export the console output, simply right click anywhere on the console and click **Save as..**



## Development

This section details the setup of a basic developmentment environment.

### Getting Started

**System Requirements**

* [Node.js][nodejs] v20

---

**Clone and Install Dependencies**

```console
> git clone https://github.com/Envel-Experimental/HeliosLauncher.git
> cd HeliosLauncher
> npm install
```

---

**Launch Application**

```console
> npm start
```

---

**Build Installers**

To build for your current platform.

```console
> npm run dist
```

Build for a specific platform.

| Platform    | Command              |
| ----------- | -------------------- |
| Windows x64 | `npm run dist:win`   |
| macOS       | `npm run dist:mac`   |
| Linux x64   | `npm run dist:linux` |

Builds for macOS may not work on Windows/Linux and vice-versa.

---

### Visual Studio Code

All development of the launcher should be done using [Visual Studio Code][vscode].

Paste the following into `.vscode/launch.json`

```JSON
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Main Process",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "program": "${workspaceFolder}/node_modules/electron/cli.js",
      "args" : ["."],
      "outputCapture": "std"
    },
    {
      "name": "Debug Renderer Process",
      "type": "chrome",
      "request": "launch",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
      "windows": {
        "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron.cmd"
      },
      "runtimeArgs": [
        "${workspaceFolder}/.",
        "--remote-debugging-port=9222"
      ],
      "webRoot": "${workspaceFolder}"
    }
  ]
}
```

This adds two debug configurations.

#### Debug Main Process

This allows you to debug Electron's [main process][mainprocess]. You can debug scripts in the [renderer process][rendererprocess] by opening the DevTools Window.

#### Debug Renderer Process

This allows you to debug Electron's [renderer process][rendererprocess]. This requires you to install the [Debugger for Chrome][chromedebugger] extension.

Note that you **cannot** open the DevTools window while using this debug configuration. Chromium only allows one debugger, opening another will crash the program.

---

### Note on Third-Party Usage

Please give credit to the original author and provide a link to the original source. This is free software, please do at least this much.

For instructions on setting up Microsoft Authentication, see https://github.com/Envel-Experimental/HeliosLauncher/blob/master/docs/MicrosoftAuth.md.

---

## Resources

* [Wiki][wiki]
* [Nebula (Create Distribution.json)][nebula]
* [v2 Rewrite Branch (Inactive)][v2branch]

---

### See you ingame.


[nodejs]: https://nodejs.org/en/ 'Node.js'
[vscode]: https://code.visualstudio.com/ 'Visual Studio Code'
[mainprocess]: https://electronjs.org/docs/tutorial/application-architecture#main-and-renderer-processes 'Main Process'
[rendererprocess]: https://electronjs.org/docs/tutorial/application-architecture#main-and-renderer-processes 'Renderer Process'
[chromedebugger]: https://marketplace.visualstudio.com/items?itemName=msjsdiag.debugger-for-chrome 'Debugger for Chrome'
[discord]: https://discord.gg/zNWUXdt 'Discord'
[wiki]: https://github.com/Envel-Experimental/HeliosLauncher/wiki 'wiki'
[nebula]: https://github.com/Envel-Experimental/Nebula 'dscalzi/Nebula'
[v2branch]: https://github.com/Envel-Experimental/HeliosLauncher/tree/ts-refactor 'v2 branch'
