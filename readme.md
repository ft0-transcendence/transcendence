# FT0 Backend

This is a backend for the Transcendence project at 42 Firenze school.

## Requirements

- NodeJS >=22.17.0

## Suggested extensions for VSCode

- [EditorConfig for VSCode](https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig)
  ```
  EditorConfig.EditorConfig
  ```
- [es6-string-html](https://marketplace.visualstudio.com/items?itemName=Tobermory.es6-string-html)
  ```
  Tobermory.es6-string-html
  ```
- [Git Graph](https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph)
  ```
  mhutchie.git-graph
  ```
- [Headwind](https://marketplace.visualstudio.com/items?itemName=heybourn.headwind)
  ```
  heybourn.headwind
  ```
- [Pretty TypeScript Errors](https://marketplace.visualstudio.com/items?itemName=yoavbls.pretty-ts-errors)
  ```
  yoavbls.pretty-ts-errors
  ```
- [Prisma](https://marketplace.visualstudio.com/items?itemName=Prisma.prisma)
  ```
  Prisma.prisma
  ```
- [Prisma Import](https://marketplace.visualstudio.com/items?itemName=ajmnz.prisma-import)
  ```
  ajmnz.prisma-import
  ```
- [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)
  ```
  bradlc.vscode-tailwindcss
  ```
- [TypeScript Importer](https://marketplace.visualstudio.com/items?itemName=pmneo.tsimporter)
  ```
  pmneo.tsimporter
  ```
- [HTML CSS Support](https://marketplace.visualstudio.com/items?itemName=ecmel.vscode-html-css)
  ```
  ecmel.vscode-html-css
  ```
- [Auto Close Tag](https://marketplace.visualstudio.com/items?itemName=formulahendry.auto-close-tag)
  ```
  formulahendry.auto-close-tag
  ```

## Getting Started

### Clone the repo

```bash
git clone https://github.com/ft0-transcendence/backend transcendence
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


