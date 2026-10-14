# DeepSentinel Web App Dockerfile
# Production-grade React frontend with Nginx

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# Which backend the built bundle talks to.
#
# Vite substitutes import.meta.env.VITE_API_URL at BUILD time, not at run
# time, so this cannot be a container environment variable — set it on the
# deploy and the bundle still carries whatever was baked in. Unset, the app
# falls back to http://localhost:8090 (src/services/api.js), which works on a
# developer's machine and reaches nothing at all from a browser pointed at
# the deployed site.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built app to Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

# Expose port
EXPOSE 80

# Run Nginx
CMD ["nginx", "-g", "daemon off;"]

# Labels for production tracking
LABEL maintainer="DeepSentinel Team" \
      version="1.0.0" \
      description="DeepSentinel Web UI"
