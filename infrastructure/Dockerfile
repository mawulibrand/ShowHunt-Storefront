FROM node:24.16.0-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@10.17.1
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# One portable image; each service selects its own entry point.
# Provider credentials and DATABASE_URL must be injected at runtime.
FROM node:24.16.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN npm install --global pnpm@10.17.1
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000 3001 4000
CMD ["node", "apps/api/dist/main.js"]
