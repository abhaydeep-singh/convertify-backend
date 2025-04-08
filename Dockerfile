FROM node:latest

RUN apt-get update && apt-get install -y ffmpeg

WORKDIR /home/app
COPY package.json /home/app/package.json
RUN npm install

COPY . /home/app
EXPOSE 5000

CMD ["node", "server.js"]



