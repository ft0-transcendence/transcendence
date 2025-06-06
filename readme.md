# FT0 Backend

This is a backend for the Transcendence project at 42 Firenze school.

## Requirements

- NodeJS 22+

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
DATABASE_URL="./db.sqlite"
```

and in prisma/schema.prisma, change the `provider` to `sqlite`.

### Push the schema to the database

```bash
npm run db:push
```

---

## Development

```bash
npm run dev
```

## Run on production

The app will be bundled with webpack in the `dist` folder in a single file.
Just run that file with node. Or run the `start` script.

```bash
npm run start
```

---


