FROM node:18-alpine

WORKDIR /app

# 보안 강화
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 패키지 파일 복사 및 의존성 설치
COPY app/package*.json ./
RUN npm install --production && npm cache clean --force

# 애플리케이션 코드 복사
COPY app/ .

# 권한 설정
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["npm", "start"]