from node:22.17.0

WORKDIR /app

COPY . .

RUN npm install

CMD ["npm", "run", "start:backend"]
