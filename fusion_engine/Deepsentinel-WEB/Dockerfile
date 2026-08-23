# DeepSentinel Web App Dockerfile
# Production-grade React frontend with Nginx

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
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
