FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY docs ./docs

ENV NODE_ENV=production
ENV STATE_FILE=/data/relayer-state.json
EXPOSE 8787
CMD ["node", "src/relayer.js"]
