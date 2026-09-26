FROM node:20-alpine

WORKDIR /app

# [Dependencies] Copy package descriptor files and install dependencies
COPY package*.json ./
RUN npm install

# [Source Code] Copy frontend application files
COPY . ./

# [Production Build] Build Next.js production bundle
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
