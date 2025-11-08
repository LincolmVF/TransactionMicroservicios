# Usamos la imagen de Node
FROM node:18-alpine

# Creamos el directorio de trabajo
WORKDIR /usr/src/app

# Copiamos el package.json para instalar dependencias
COPY package*.json ./

# Instalamos las dependencias
RUN npm install

# Copiamos todo el resto del código (nuestro index.js)
COPY . .

# Exponemos el puerto
EXPOSE 3002

# El comando para arrancar el servidor
CMD [ "node", "index.js" ]