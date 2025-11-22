# --- Etapa 1: Construcción ---
# Usamos una imagen oficial de Node.js 18 (LTS).
# "alpine" es una versión muy ligera de Linux.
FROM node:18-alpine AS builder

# Establecemos el directorio de trabajo DENTRO del contenedor
WORKDIR /app

# Copiamos los archivos de dependencias
COPY package.json package-lock.json ./

# Instalamos SOLAMENTE las dependencias de producción
# Esto es más rápido y seguro que 'npm install'
# y omite 'nodemon' y otras 'devDependencies'.
RUN npm ci --only=production

# --- Etapa 2: Producción ---
# Empezamos desde una imagen de Node limpia
FROM node:18-alpine

# Establecemos el directorio de trabajo
WORKDIR /app

# Copiamos las dependencias que instalamos en la etapa anterior
COPY --from=builder /app/node_modules ./node_modules

# Copiamos el resto de nuestro código
# (El .dockerignore se encargará de no copiar cosas innecesarias)
COPY ./src ./src
COPY package.json package-lock.json ./

# Le decimos a Docker que nuestro servicio usará este puerto
ENV PORT=3001
EXPOSE 3001

# El comando final para arrancar el servicio
# Asume que tienes un script "start" en tu package.json
# "start": "node src/server.js"
CMD [ "npm", "start" ]