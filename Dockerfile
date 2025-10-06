# 1. Start with the full Node.js environment
FROM node:18

# 2. Create a directory for the app files
WORKDIR /app

# 3. Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# 4. Copy the rest of your project files
COPY . .

# 5. Tell Docker which port the app will run on
EXPOSE 3000

# 6. The command to start the app
CMD [ "npm", "run", "start" ]