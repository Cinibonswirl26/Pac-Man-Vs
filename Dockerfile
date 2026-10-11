# Pac-Man Vs. Online: one Node process serving the page and the WebSocket room server.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY shared ./shared
COPY client ./client
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "server/server.js"]
