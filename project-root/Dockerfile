FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .
EXPOSE 3000

CMD ["node", "server.js"]
