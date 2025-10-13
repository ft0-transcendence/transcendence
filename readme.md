# FT0 Backend

This is a backend for the Transcendence project at 42 Firenze school.

## Requirements

- NodeJS >=22.17.0

## Suggested extensions for VSCode

You can either install the extensions from this [link](https://vscode.dev/profile/github/14c11ec940c0fdffb7ef44ccdb4c087b) or install them manually:

- adrianwilczynski.format-selection-as-html
- ajmnz.prisma-import
- arcanis.vscode-zipfs
- bierner.markdown-checkbox
- bradlc.vscode-tailwindcss
- cesium.gltf-vscode
- christian-kohler.npm-intellisense
- ctcuff.font-preview
- dbaeumer.vscode-eslint
- ecmel.vscode-html-css
- editorconfig.editorconfig
- formulahendry.auto-close-tag
- formulahendry.auto-rename-tag
- github.copilot
- github.copilot-chat
- gruntfuggly.todo-tree
- jock.svg
- johnpapa.vscode-cloak
- kisstkondoros.vscode-gutter-preview
- lightyen.tailwindcss-intellisense-twin
- mhutchie.git-graph
- mikestead.dotenv
- ms-vscode-remote.remote-ssh
- ms-vscode-remote.remote-ssh-edit
- ms-vscode-remote.remote-wsl
- ms-vscode.remote-explorer
- nutshellheadwear.oscuro-theme
- orta.vscode-twoslash
- pkief.material-icon-theme
- pmneo.tsimporter
- prisma.prisma
- raczzalan.webgl-glsl-editor
- supermaven.supermaven
- tobermory.es6-string-html
- usernamehw.errorlens
- vadimcn.vscode-lldb
- yoavbls.pretty-ts-errors
- yzhang.markdown-all-in-one

Oneliner to install all extensions:

Linux:
```bash
#!/bin/bash
cat << EOF | xargs -L 1 code --install-extension
adrianwilczynski.format-selection-as-html
ajmnz.prisma-import
arcanis.vscode-zipfs
bierner.markdown-checkbox
bradlc.vscode-tailwindcss
cesium.gltf-vscode
christian-kohler.npm-intellisense
ctcuff.font-preview
dbaeumer.vscode-eslint
ecmel.vscode-html-css
editorconfig.editorconfig
formulahendry.auto-close-tag
formulahendry.auto-rename-tag
github.copilot
github.copilot-chat
gruntfuggly.todo-tree
jock.svg
johnpapa.vscode-cloak
kisstkondoros.vscode-gutter-preview
lightyen.tailwindcss-intellisense-twin
mhutchie.git-graph
mikestead.dotenv
ms-vscode-remote.remote-ssh
ms-vscode-remote.remote-ssh-edit
ms-vscode-remote.remote-wsl
ms-vscode.remote-explorer
nutshellheadwear.oscuro-theme
orta.vscode-twoslash
pkief.material-icon-theme
pmneo.tsimporter
prisma.prisma
raczzalan.webgl-glsl-editor
supermaven.supermaven
tobermory.es6-string-html
usernamehw.errorlens
vadimcn.vscode-lldb
yoavbls.pretty-ts-errors
yzhang.markdown-all-in-one
EOF
```

## Getting Started

### Clone the repo

```bash
git clone https://github.com/ft0-transcendence/transcendence transcendence
cd transcendence
```

### Install dependencies

```bash
npm install
```

### Configure .env

Copy `.env.example` to `.env` and fill in the values.

#### AUTH_SECRET

Get one with

```bash
npx auth secret --raw
```

#### DATABASE_URL

If you want to use sqlite instead of mysql, change the `DATABASE_URL` in `.env` to the following:

```bash
DATABASE_URL="file:./db.sqlite"
```

and in prisma/schema.prisma, change the `provider` to `sqlite`.

### Push the schema to the database

```bash
npm run db:push
```

---

## Development

You can run bothe the backend and the frontend in development mode.
```bash
npm run dev
```

If you want to run the backend only, run

```bash
npm run dev:backend
```

If you want to run the frontend only, run

```bash
npm run dev:frontend
```

---

## Build

To build the app, run

```bash
npm run build
```

## Run on production

```bash
npm run start
```


If you want to run the backend only, run

```bash
npm run start:backend
```

If you want to run the frontend only, run

```bash
npm run start:frontend
```

---


