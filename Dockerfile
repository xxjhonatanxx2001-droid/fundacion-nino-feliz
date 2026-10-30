# Build stage
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src

# Declarar los argumentos para la compilación de Vite
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Convertirlos en variables de entorno accesibles por Vite
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# Runtime stage
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY --from=build /app/dist ./dist

# Variables de entorno requeridas por el servidor en tiempo de ejecución
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY

EXPOSE 8080
CMD ["node", "server/index.js"]
