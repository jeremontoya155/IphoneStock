# Usa la imagen base oficial de Node.js LTS
FROM node:18-alpine

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia package.json y package-lock.json al contenedor
COPY package*.json ./

# Instala las dependencias
RUN npm install --production

# Copia todo el código fuente al contenedor
COPY . .

# Exponer el puerto utilizado por la aplicación
EXPOSE 5600

# Configuración de la variable de entorno para el puerto
ENV PORT=5600

# Comando para iniciar la aplicación
CMD ["node", "server.js"]
