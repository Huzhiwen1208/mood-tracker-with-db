FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends default-mysql-client \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY backend ./backend
COPY biz_client ./biz_client
COPY frontend ./frontend
COPY scripts ./scripts
COPY sql ./sql

EXPOSE 9090

CMD ["npm", "start"]
