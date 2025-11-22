# Usamos Node 18 (ligero)
FROM node:18-alpine

# Directorio dentro del contenedor
WORKDIR /app

# Copiamos primero los archivos de dependencias
COPY package.json package-lock.json ./

# Instalamos dependencias
RUN npm install

# Copiamos el resto del código
COPY . .

# Exponemos el puerto interno estándar de React
EXPOSE 3000

# Iniciamos la aplicación
CMD ["npm", "start"]