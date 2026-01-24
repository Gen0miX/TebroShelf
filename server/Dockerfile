FROM node:20-alpine AS build

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY --from=build /app/drizzle.config.ts ./
COPY --from=build /app/src/db ./src/db
RUN npm ci --omit=dev

# Install drizzle-kit for migrations (needed at runtime)
RUN npm install drizzle-kit

# Copy entrypoint script and fix line endings (Windows -> Unix)
COPY docker-entrypoint.sh ./
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

# Remove build dependencies to reduce image size
RUN apk del python3 make g++

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
