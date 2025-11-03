# 1. Start with the full Node.js environment
FROM node:18

# 2. Create a directory for the app files
WORKDIR /app

# 3. Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# 4. Copy the rest of your project files
COPY . .

# 5. Make the startup script executable
RUN chmod +x scripts/start-with-migration.sh

# 6. Tell Docker which port the app will run on
EXPOSE 3000

# 7. The command to start the app with migrations
CMD [ "sh", "scripts/start-with-migration.sh" ]