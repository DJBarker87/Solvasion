FROM node:20-slim

WORKDIR /app

# Install build tools for better-sqlite3 native module
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy backend package files and install
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci

# Copy backend source + schema
COPY backend/src/ backend/src/
COPY backend/tsconfig.json backend/
COPY backend/db/schema.sql backend/db/

# Copy IDL (referenced by backend as ../../target/idl/solvasion.json from dist/)
COPY target/idl/solvasion.json target/idl/

# Build TypeScript
RUN cd backend && npm run build

# Prune dev dependencies
RUN cd backend && npm prune --production

WORKDIR /app/backend
EXPOSE 3001

CMD ["node", "dist/main.js"]
