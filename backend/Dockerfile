FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production PORT=4000
EXPOSE 4000
# Applies migrations, seeds 10k employees on a fresh DB, then starts the API.
CMD ["npm", "run", "start:prod"]
